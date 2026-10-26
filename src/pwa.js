// Installability is progressive enhancement: gameplay never depends on this.
let installPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  const button = document.getElementById('install-button');
  if (button) button.hidden = false;
});
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('install-button')?.addEventListener('click', async event => {
    if (!installPrompt) return;
    const button = event.currentTarget;
    const prompt = installPrompt;
    await prompt.prompt();
    await prompt.userChoice;
    installPrompt = undefined;
    button.hidden = true;
  });
});
window.addEventListener('appinstalled', () => {
  const button = document.getElementById('install-button');
  if (button) button.hidden = true;
  installPrompt = undefined;
});
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => {
      console.warn('Modalità offline non disponibile:', error.message);
    });
  });
}
