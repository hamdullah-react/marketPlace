import {
  Mail, Phone, Globe, Ghost, Link as LinkIcon, MessageCircle, Send, MapPin, Store, Star,
  Image as ImageIcon, Video, FileText,
} from 'lucide-react';

/**
 * The site's social links (Admin → Settings → Contact & links) as raised
 * round buttons. Server component, no client JS.
 *
 * A platform with an SVG mark is drawn as a CSS mask so it takes the brand
 * colour; a custom link or a platform without an SVG uses its lucide icon.
 *
 * `links` is the output of socialLinksOf() from lib/social.ts.
 */

const MARKS = {
  link: LinkIcon, globe: Globe, ghost: Ghost, 'message-circle': MessageCircle, send: Send,
  phone: Phone, mail: Mail, 'map-pin': MapPin, store: Store, star: Star, image: ImageIcon,
  video: Video, 'file-text': FileText,
};

export default function SiteSocialIcons({ links = [], size = 'md', className = '' }) {
  if (!links.length) return null;

  const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  const mark = size === 'lg' ? 'h-5 w-5' : 'h-[17px] w-[17px]';

  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      {links.map((s, i) => {
        const Icon = MARKS[s.lucide] ?? LinkIcon;
        return (
          <a
            key={`${s.key}-${i}`}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            title={s.label}
            className={`group/social raised flex ${box} items-center justify-center rounded-full`}
          >
            {s.icon ? (
              <span
                aria-hidden="true"
                className={`block ${mark} bg-brand-primary transition-colors duration-300 group-hover/social:bg-brand-dark dark:bg-brand-on-dark dark:group-hover/social:bg-white`}
                style={{
                  maskImage: `url(${s.icon})`,
                  WebkitMaskImage: `url(${s.icon})`,
                  maskSize: 'contain',
                  WebkitMaskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  WebkitMaskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  WebkitMaskPosition: 'center',
                }}
              />
            ) : (
              <Icon
                aria-hidden="true"
                className={`${mark} text-brand-primary transition-colors duration-300 group-hover/social:text-brand-dark dark:text-brand-on-dark dark:group-hover/social:text-white`}
              />
            )}
          </a>
        );
      })}
    </div>
  );
}
