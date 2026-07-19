(function(){
  function localToday(){
    if(typeof dateOnly === 'function') return dateOnly(new Date());
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function ensureReportDateInputValue(){
    const input = document.getElementById('reportDateInput');
    if(input && !input.value) input.value = selectedReportCustomDate || localToday();
    return input;
  }

  if(typeof reportFilterHtml === 'function'){
    const originalReportFilterHtml = reportFilterHtml;
    reportFilterHtml = function(active){
      const html = originalReportFilterHtml(active);
      const defaultValue = selectedReportCustomDate || localToday();
      return html.replace(/(<input id="reportDateInput"[^>]*value=")([^"]*)(")/, function(match, prefix, value, suffix){
        return prefix + (value || defaultValue) + suffix;
      });
    };
  }

  if(typeof openReportDatePicker === 'function'){
    openReportDatePicker = function(){
      const input = ensureReportDateInputValue();
      if(!input) return;
      if(input.showPicker) input.showPicker();
      else input.click();
    };
  }

  document.addEventListener('pointerdown', function(event){
    if(event.target && event.target.id === 'reportDateInput') ensureReportDateInputValue();
  }, true);

  document.addEventListener('DOMContentLoaded', function(){
    const list = document.getElementById('list');
    if(!list) return;
    new MutationObserver(ensureReportDateInputValue).observe(list,{childList:true,subtree:true});
  });
})();
