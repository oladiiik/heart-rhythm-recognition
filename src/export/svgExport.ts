const EXPORT_SCALE = 2;

/**
 * Перемальовує SVG-графік на полотно, з якого його можна зберегти як PNG, JPG чи BMP.
 * Елементи з атрибутом data-export-skip (підсвітка під вказівником) у файл не потрапляють
 */
export function svgToCanvas(svg: SVGSVGElement): Promise<HTMLCanvasElement> {
  const { width, height } = svg.viewBox.baseVal;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.querySelectorAll('[data-export-skip]').forEach((node) => node.remove());

  const source = new XMLSerializer().serializeToString(clone);
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * EXPORT_SCALE;
      canvas.height = height * EXPORT_SCALE;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Не вдалося створити полотно для зображення.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error('Не вдалося перетворити графік на зображення.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  });
}
