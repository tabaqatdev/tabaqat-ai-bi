import Image from 'next/image';

export default function LogoBar() {
  return (
    <Image
      src="/images/tabaqat-logo.png"
      alt="Tabaqat"
      width={80}
      height={30}
    />
  );
}
