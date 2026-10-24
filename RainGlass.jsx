// React wrapper for rainGlass.js. Put it as the first child of the overlay container.
import { useEffect, useRef } from 'react';
import { mountRainGlass } from './rainGlass';

export default function RainGlass({ src, rain = 1, fog = 0.85, refraction = 1, speed = 1 }) {
  const ref = useRef(null);
  const ctl = useRef(null);

  useEffect(() => {
    ctl.current = mountRainGlass(ref.current, { src, rain, fog, refraction, speed });
    return () => ctl.current();
  }, [src]);

  useEffect(() => { ctl.current?.set({ rain, fog, refraction, speed }); }, [rain, fog, refraction, speed]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', zIndex: 0 }}
    />
  );
}
