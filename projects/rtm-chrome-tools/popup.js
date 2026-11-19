// Entry point for the extension's popup.
// No RTM connection or task changes are made in this starter version.

function showStatus(message) {
  document.getElementById('status').textContent = message;
}

function testExtension() {
  showStatus('Extension is working.');
}

document.getElementById('check').addEventListener('click', testExtension);
