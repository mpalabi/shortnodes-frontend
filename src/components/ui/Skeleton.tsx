import React from 'react';

type Props = React.HTMLAttributes<HTMLDivElement> & { className?: string };

export function Skeleton({ className = '', ...rest }: Props) {
  return (
    <div
      className={`relative overflow-hidden bg-gray-100 ${className}`}
      {...rest}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      <style>{`@keyframes shimmer{100%{transform:translateX(100%)}}`}</style>
    </div>
  );
}

export default Skeleton;


