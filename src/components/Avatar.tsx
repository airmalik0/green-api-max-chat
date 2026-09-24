import styles from './Avatar.module.css';

const COLORS = [
  '#ff7a59',
  '#f5a623',
  '#34c759',
  '#00b8ff',
  '#007aff',
  '#8083ff',
  '#b186ff',
  '#ff5e8a',
];

interface Props {
  title: string;
  size?: number;
}

export function Avatar({ title, size = 48 }: Props) {
  const letters = title.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  const initials =
    letters
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '#';
  const hash = [...title].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
  const color = COLORS[hash % COLORS.length];
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: size * 0.38, background: color }}
      aria-hidden="true"
    >
      {/^\d/.test(initials) ? (
        <svg viewBox="0 0 24 24" width="55%" height="55%">
          <path
            fill="currentColor"
            d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"
          />
        </svg>
      ) : (
        initials
      )}
    </span>
  );
}
