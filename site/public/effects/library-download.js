// Add a direct download action to each built-in effect's generated sprite sheet.
const output = document.querySelector('#d-sheet');
if (output) {
  const addDownload = () => {
    const image = output.querySelector('img');
    if (!image || output.querySelector('[data-sheet-download]')) return;
    const rawId = document.querySelector('#d-id')?.textContent?.trim() || 'effect';
    const name = rawId.split('/').pop().replace(/[^a-zA-Z0-9_-]/g, '-') || 'effect';
    const link = document.createElement('a');
    link.dataset.sheetDownload = 'true';
    link.href = image.src;
    link.download = `${name}.png`;
    link.textContent = 'PNG 스프라이트 시트 다운로드';
    link.className = 'btn';
    link.style.display = 'inline-block';
    link.style.margin = '.75rem 0';
    image.insertAdjacentElement('afterend', link);
  };
  new MutationObserver(addDownload).observe(output, {childList: true});
  addDownload();
}
