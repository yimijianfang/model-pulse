// Smooth each interval without overshooting its measured endpoint values.
// Horizontal tangents at samples also preserve local minima and maxima.
export function smoothPath(points) {
  if (!points.length) return '';
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0,y0] = points[i-1], [x1,y1] = points[i];
    const middle = (x0+x1)/2;
    path += x1 === x0 ? ` L${x1},${y1}` : ` C${middle},${y0} ${middle},${y1} ${x1},${y1}`;
  }
  return path;
}
