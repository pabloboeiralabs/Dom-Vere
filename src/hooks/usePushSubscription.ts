import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/**
 * Convert a base64url-encoded VAPID public key to a Uint8Array
 * as required by PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

/**
 * Hook to manage Web Push subscription for a customer.
 *
 * When `enabled` is true, subscribes to push notifications and persists
 * the subscription to the `push_subscriptions` table. When disabled or
 * on logout, unsubscribes and removes the DB record.
 *
 * @param customerId - The customer's UUID
 * @param userId - The shop owner's UUID
 * @param enabled - Whether push notifications are enabled
 * @returns { unsubscribe } - Call on logout to clean up
 */
export function usePushSubscription(
  customerId: string | undefined,
  userId: string | undefined,
  enabled: boolean
) {
  const subRef = useRef<PushSubscription | null>(null);

  useEffect(() => {
    if (!customerId || !userId || !enabled) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[Push] Browser does not support Web Push");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      console.warn("[Push] VITE_VAPID_PUBLIC_KEY not configured");
      return;
    }

    let cancelled = false;

    const subscribe = async () => {
      try {
        // Wait for service worker to be active
        const registration = await navigator.serviceWorker.ready;

        // Check existing subscription
        const existing = await registration.pushManager.getSubscription();
        const expectedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        // Helper to check if the subscription matches the VAPID public key
        const isSameKey = (existingKey: ArrayBuffer | null) => {
          if (!existingKey) return false;
          const current = new Uint8Array(existingKey);
          if (current.length !== expectedKey.length) return false;
          for (let i = 0; i < current.length; i++) {
            if (current[i] !== expectedKey[i]) return false;
          }
          return true;
        };

        if (existing && isSameKey(existing.options.applicationServerKey)) {
          // Key matches, reuse it and make sure it's in the DB
          subRef.current = existing;
          const subJson = existing.toJSON();
          if (subJson.endpoint) {
            await supabase.from("push_subscriptions").upsert(
              {
                customer_id: customerId,
                user_id: userId,
                endpoint: subJson.endpoint,
                p256dh_key: (subJson.keys as any)?.p256dh ?? "",
                auth_key: (subJson.keys as any)?.auth ?? "",
              },
              { onConflict: "endpoint" }
            );
          }
          return;
        }

        // VAPID key mismatch or no subscription — unsubscribe existing first
        if (existing) {
          try {
            await existing.unsubscribe();
            const oldEndpoint = existing.toJSON().endpoint;
            if (oldEndpoint) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", oldEndpoint);
            }
          } catch (unsubErr) {
            console.warn("[Push] Error cleaning up old subscription:", unsubErr);
          }
        }

        // Subscribe fresh with current VAPID key
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey,
        });

        if (cancelled) {
          await subscription.unsubscribe();
          return;
        }

        subRef.current = subscription;

        // Persist to database
        const subJson = subscription.toJSON();
        const { error } = await supabase.from("push_subscriptions").upsert(
          {
            customer_id: customerId,
            user_id: userId,
            endpoint: subJson.endpoint!,
            p256dh_key: (subJson.keys as any)?.p256dh ?? "",
            auth_key: (subJson.keys as any)?.auth ?? "",
          },
          { onConflict: "endpoint" }
        );

        if (error) {
          console.error("[Push] Failed to save subscription:", error.message);
        } else {
          console.log("[Push] Subscription saved successfully");
        }
      } catch (err: any) {
        // NotAllowedError = user denied permission — not an error to log loudly
        if (err?.name === "NotAllowedError") {
          console.log("[Push] Notification permission denied by user");
        } else {
          console.error("[Push] Subscription error:", err?.message || err);
        }
      }
    };

    subscribe();

    return () => {
      cancelled = true;
    };
  }, [customerId, userId, enabled]);

  // Exposed for logout cleanup
  const unsubscribe = useCallback(async () => {
    const sub = subRef.current;
    if (!sub) return;

    try {
      await sub.unsubscribe();
      const subJson = sub.toJSON();
      if (subJson.endpoint) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", subJson.endpoint);
      }
      console.log("[Push] Unsubscribed and cleaned up");
    } catch (err: any) {
      console.error("[Push] Unsubscribe error:", err?.message || err);
    }
    subRef.current = null;
  }, []);

  return { unsubscribe };
}
