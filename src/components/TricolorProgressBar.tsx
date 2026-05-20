interface TricolorProgressBarProps {
  usagePercent: number;   // green
  paidPercent: number;    // yellow (paid but not used)
  pendingPercent: number; // red
}

export default function TricolorProgressBar({ usagePercent, paidPercent, pendingPercent }: TricolorProgressBarProps) {
  return (
    <div className="w-full h-3 rounded-full overflow-hidden bg-muted flex">
      {usagePercent > 0 && (
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${usagePercent}%` }}
        />
      )}
      {paidPercent > 0 && (
        <div
          className="h-full bg-yellow-500 transition-all"
          style={{ width: `${paidPercent}%` }}
        />
      )}
      {pendingPercent > 0 && (
        <div
          className="h-full bg-red-500 transition-all"
          style={{ width: `${pendingPercent}%` }}
        />
      )}
    </div>
  );
}
