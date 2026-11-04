/** Clipboard write with a fallback for insecure contexts (e.g. plain http). */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('El navegador no permitió copiar.');
  } finally {
    document.body.removeChild(textarea);
  }
}
