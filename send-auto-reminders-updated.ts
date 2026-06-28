// Updated send-auto-reminders edge function
// Changes: reads customer.reminder_hours preference, falls back to barbearia's reminder_hours

// Key change in the query - add customers!inner(id, name, phone, credit_balance, reminder_hours):
// .select("id, starts_at, expires_at, usage_limit, customer_id, plan_id, customers!inner(id, name, phone, credit_balance, reminder_hours), plans!inner(name, validity_days)")

// Key change in the loop - use customer preference:
// const reminderHours = customer.reminder_hours ?? defaultReminderHours;
// const reminderMs = reminderHours * 60 * 60 * 1000;

// Then use reminderMs in the comparison instead of hardcoded 24h:
// const timeToReturn = returnDate.getTime() - now.getTime();
// const timeToExpiry = expiresAt.getTime() - now.getTime();
// if (returnTpl && timeToReturn > 0 && timeToReturn <= reminderMs) {
// if (expiryTpl && timeToExpiry > 0 && timeToExpiry <= reminderMs) {
