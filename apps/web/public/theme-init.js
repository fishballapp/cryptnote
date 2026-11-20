try {
  const saved = localStorage.getItem('cryptnote-color-scheme');
  if (saved === 'light' || saved === 'dark') {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', saved);
  }
} catch {}
