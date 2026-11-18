import React from 'react';
import { ExternalLink } from 'lucide-react';

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

export function renderFormattedMessageText(
  text: string,
  onOpenLink: (url: string) => void
): React.ReactNode {
  if (!text) return null;

  const parts = text.split(URL_REGEX);

  return parts.map((part, i) => {
    if (part.match(URL_REGEX)) {
      let hostname = '';
      try {
        hostname = new URL(part).hostname;
      } catch {
        hostname = part;
      }

      return (
        <span
          key={i}
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onOpenLink(part);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onOpenLink(part);
            }
          }}
          className="inline-flex items-center gap-1 underline underline-offset-2 decoration-[var(--accent)] text-[var(--accent)] hover:opacity-80 cursor-pointer font-medium"
          title={`Open external link to ${hostname}`}
        >
          <span>{part}</span>
          <span className="text-[10px] opacity-75 no-underline">({hostname})</span>
          <ExternalLink size={11} className="inline shrink-0" />
        </span>
      );
    }
    return part;
  });
}
