type Props = { size?: number; className?: string };

export default function SmartBuildMark({ size = 28, className = "" }: Props) {
  return (
    <svg aria-label="SmartBuild" role="img" width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="2.5" y="2.5" width="27" height="27" rx="8" fill="#102331" stroke="#4B8793" strokeWidth="1.25" />
      <ellipse cx="16" cy="16" rx="8.4" ry="11.2" transform="rotate(42 16 16)" stroke="#9CE5E7" strokeWidth="1.35" />
      <path d="m8.8 20.7 14.4-9.4" stroke="#67D3C5" strokeWidth="1.45" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.7" fill="#B8F1EF" />
    </svg>
  );
}
