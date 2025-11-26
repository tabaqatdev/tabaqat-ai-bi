import Image from 'next/image';

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

export const Logo = (props: Props) => {
  const { width = 100, height = 48, className } = props;
  return (
    <Image
      src="/images/tabaqat-logo.png"
      alt="Tabaqat"
      width={width}
      height={height}
      className={className}
    />
  );
};
