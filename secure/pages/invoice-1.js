// Normalize jsPDF — UMD bundle may expose as window.jspdf.jsPDF or window.jsPDF
window.addEventListener('load', function() {
  if (window.jspdf && window.jspdf.jsPDF && !window.jsPDF) {
    window.jsPDF = window.jspdf.jsPDF;
  }
});
