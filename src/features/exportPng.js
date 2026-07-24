import html2canvas from 'html2canvas';
import { Toast } from '../ui/toast.js';

/**
 * Render the rack to a PNG and trigger a download.
 * Temporarily neutralises transforms/shadows and hides the cable overlay so the
 * capture is crisp and correctly positioned.
 */
export async function exportPNG(btn) {
  const target = document.getElementById('rack-wrapper');
  if (!target) return;

  const original = btn.textContent;
  btn.textContent = '⏳ Rendering…';
  btn.disabled = true;

  document.querySelectorAll('.device.placed.selected').forEach((d) => d.classList.remove('selected'));
  const savedTransform = target.style.transform;
  target.style.transform = 'none';

  const cabinet = target.querySelector('.rack-cabinet');
  const savedShadow = cabinet.style.boxShadow;
  cabinet.style.boxShadow = 'none';

  const svg = document.getElementById('cable-svg');
  svg.style.display = 'none';

  try {
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: null, useCORS: true, logging: false });
    const link = document.createElement('a');
    link.download = `mini-rack-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error(err);
    Toast.show('Screenshot failed — please try again.');
  } finally {
    target.style.transform = savedTransform;
    cabinet.style.boxShadow = savedShadow;
    svg.style.display = '';
    btn.textContent = original;
    btn.disabled = false;
  }
}
