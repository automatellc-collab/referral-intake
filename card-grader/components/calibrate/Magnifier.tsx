interface MagnifierProps {
  dataUrl: string;
  containerWidth: number;
  containerHeight: number;
  point: { x: number; y: number };
}

const SIZE = 96;
const ZOOM = 3;

export function Magnifier({ dataUrl, containerWidth, containerHeight, point }: MagnifierProps) {
  const offsetX = point.x * ZOOM - SIZE / 2;
  const offsetY = point.y * ZOOM - SIZE / 2;

  return (
    <div
      className="pointer-events-none absolute z-10 rounded-full border-2 border-white shadow-lg"
      style={{
        width: SIZE,
        height: SIZE,
        left: Math.min(Math.max(0, point.x - SIZE / 2), containerWidth - SIZE),
        top: Math.max(0, point.y - SIZE - 24),
        backgroundImage: `url(${dataUrl})`,
        backgroundSize: `${containerWidth * ZOOM}px ${containerHeight * ZOOM}px`,
        backgroundPosition: `-${offsetX}px -${offsetY}px`,
      }}
    />
  );
}
