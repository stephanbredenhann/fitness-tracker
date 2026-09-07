export const BLUE = '#2457f5', INK2 = '#5a6785', HAIR = '#d5dced';

// Shared Chart.js options: recessive grid, index tooltips, no aspect lock so .chart sets the height.
export const chartBase = {
  responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
  interaction: { mode: 'index' as const, intersect: false },
  plugins: { tooltip: { backgroundColor: '#101a32', titleFont: { weight: 'normal' as const }, padding: 10, displayColors: false } },
  scales: {
    x: { grid: { display: false }, border: { color: HAIR }, ticks: { color: INK2, maxTicksLimit: 8, maxRotation: 0 } },
    y: { grid: { color: HAIR }, border: { display: false }, ticks: { color: INK2, maxTicksLimit: 6 } },
  },
};
