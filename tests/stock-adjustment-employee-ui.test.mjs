import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../store-stock-adjustment.js', import.meta.url), 'utf8');
const popupSource = fs.readFileSync(new URL('../store-qty-popup.js', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../store-stock-adjustment.css', import.meta.url), 'utf8');
const stockHtml = fs.readFileSync(new URL('../store_stock.html', import.meta.url), 'utf8');

test('employee adjustment page injects its own Supabase client into the shared API', () => {
  assert.match(source, /StockAdjustmentApi\.create\(client\)/);
  assert.doesNotMatch(source, /StockAdjustmentApi\.(save|submit|withdraw|mine)\(/);
});

test('direction is selected with direct buttons and not a select box', () => {
  assert.match(source, /directionButton\(product\.id, 'plus', '增加'/);
  assert.match(source, /directionButton\(product\.id, 'minus', '减少'/);
  assert.doesNotMatch(source, /stock-dir-select/);
  assert.doesNotMatch(source, /<select[^>]+direction/);
});

test('loose quantity reuses the order page picker controls', () => {
  assert.match(source, /class="sell-line stock-adjustment-sell-line"/);
  assert.match(source, /class="sell-tag"[^>]*>散<\/span>/);
  assert.match(source, /class="ios-picker"/);
  assert.match(source, /makeQtyOptions\(100,row\.qty\)/);
  assert.match(source, /class="sell-unit"/);
  assert.doesNotMatch(source, /type="number"/);
  assert.doesNotMatch(source, /箱数|盒数|wholeQty|caseQty|boxQty/);
});

test('adjustment mode renders the new page before hiding the base back button or waiting for records', () => {
  const openStart = source.indexOf('window.openStockAdjustmentMode');
  const closeStart = source.indexOf('window.closeStockAdjustmentMode', openStart);
  const openBody = source.slice(openStart, closeStart);
  assert.ok(openBody.indexOf('window.renderStockAdjustmentMode()') < openBody.indexOf('await refreshRequestPanels()'));

  const renderStart = source.indexOf('window.renderStockAdjustmentMode');
  const editStart = source.indexOf('window.editStockAdjustmentRequest', renderStart);
  const renderBody = source.slice(renderStart, editStart);
  assert.ok(renderBody.indexOf('list.innerHTML') < renderBody.indexOf('setBaseBackVisible(false)'));
});

test('product card removes the duplicate spec and flavor line', () => {
  const start = source.indexOf('function adjustmentCard');
  const end = source.indexOf('function selectedHtml', start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /product\.spec/);
  assert.doesNotMatch(body, /product\.flavor/);
});

test('direction buttons are vertical and placed left of the quantity picker', () => {
  const start = source.indexOf('function adjustmentCard');
  const end = source.indexOf('function selectedHtml', start);
  const body = source.slice(start, end);
  assert.ok(body.indexOf('stock-adjustment-direction') < body.indexOf('stock-adjustment-sell-line'));
  assert.match(cssSource, /\.stock-adjustment-controls\{[^}]*grid-template-columns:54px minmax\(0,1fr\)/);
  assert.match(cssSource, /\.stock-adjustment-direction\{[^}]*flex-direction:column/);
});

test('projected stock aligns with current stock before the controls', () => {
  const start = source.indexOf('function adjustmentCard');
  const end = source.indexOf('function selectedHtml', start);
  const body = source.slice(start, end);
  assert.ok(body.indexOf('stock-adjustment-current') < body.indexOf('stock-adjustment-projected'));
  assert.ok(body.indexOf('stock-adjustment-projected') < body.indexOf('stock-adjustment-controls'));
  assert.match(cssSource, /\.stock-adjustment-projected\{[^}]*padding:0 10px/);
});

test('request sections are separated and placed above the product filters', () => {
  assert.match(source, /requestBlock\('待审核申请'/);
  assert.match(source, /requestBlock\('已驳回申请'/);
  assert.match(source, /requestBlock\('历史记录'/);
  assert.match(source, /requestBlock\('已撤回申请'/);

  const renderStart = source.indexOf('window.renderStockAdjustmentMode');
  const editStart = source.indexOf('window.editStockAdjustmentRequest', renderStart);
  const renderBody = source.slice(renderStart, editStart);
  assert.ok(renderBody.indexOf('stock-adjustment-request-panels') < renderBody.indexOf('stock-adjustment-filters'));
});

test('approved history lists spec flavor on separate lines with signed quantities', () => {
  const historyStart = source.indexOf('function historyItemsHtml');
  const historyEnd = source.indexOf('function requestBlock', historyStart);
  const historyBody = source.slice(historyStart, historyEnd);
  assert.match(historyBody, /StockAdjustmentCore\.formatSpecFlavor\(item\)/);
  assert.doesNotMatch(historyBody, /item\.product_name/);
  assert.match(historyBody, /stock-adjustment-history-line/);
  assert.match(historyBody, /quantity > 0 \? '\+' : ''/);
  assert.match(historyBody, /qty-positive/);
  assert.match(historyBody, /qty-negative/);
  assert.match(historyBody, /display:flex/);
});

test('reason is selected only when submitting and missed receipt is removed', () => {
  assert.match(source, /onclick="openStockAdjustmentSubmitDialog\(\)"/);
  assert.match(source, /id="stockAdjustmentSubmitMask"/);
  assert.match(source, /confirmStockAdjustmentSubmit/);
  assert.match(source, /盘点差异/);
  assert.match(source, /破损报废/);
  assert.match(source, /调货/);
  assert.match(source, /其他/);
  assert.doesNotMatch(source, /漏录入库|missed_receipt/);
});

test('stock page loads the dedicated adjustment stylesheet', () => {
  assert.match(stockHtml, /store-stock-adjustment\.css/);
});

test('stock adjustment quantity is handled by the same 5x5 popup used by order entry', () => {
  assert.match(popupSource, /QUICK_NUMBERS = Array\.from\(\{ length: 25 \}/);
  assert.match(popupSource, /qty-popup-grid-5/);
  assert.match(popupSource, /parseStockAdjustmentSelect/);
  assert.match(popupSource, /stockAdjustmentChange/);
  assert.match(popupSource, /STATE\.handler === 'stockAdjustment'/);
});

test('single product changes update only the row and summary', () => {
  const start = source.indexOf('function setDraft');
  const end = source.indexOf('window.stockAdjustmentChange', start);
  const setDraftBody = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'setDraft should exist');
  assert.match(setDraftBody, /updateAdjustmentRow\(key\)/);
  assert.match(setDraftBody, /updateAdjustmentSummary\(\)/);
  assert.doesNotMatch(setDraftBody, /renderStockAdjustmentMode/);
  assert.doesNotMatch(setDraftBody, /\.mine\(/);
});

test('brand and spec switches rerender only the product area', () => {
  const brandStart = source.indexOf('window.selectBrand = function');
  const specStart = source.indexOf('window.selectSpec = function', brandStart);
  const rowsStart = source.indexOf('function rows', specStart);
  const brandBody = source.slice(brandStart, specStart);
  const specBody = source.slice(specStart, rowsStart);
  assert.match(brandBody, /renderAdjustmentProductArea\(\)/);
  assert.match(specBody, /renderAdjustmentProductArea\(\)/);
  assert.doesNotMatch(brandBody, /renderStockAdjustmentMode/);
  assert.doesNotMatch(specBody, /renderStockAdjustmentMode/);
});

test('editing a negative request restores decrease and absolute quantity', () => {
  assert.match(source, /Number\(item\.adjustment_qty\) < 0 \? 'minus' : 'plus'/);
  assert.match(source, /Math\.abs\(Number\(item\.adjustment_qty\)\)/);
});

test('employee submission uses one atomic API call and never writes stock directly', () => {
  const start = source.indexOf('window.confirmStockAdjustmentSubmit');
  const end = source.indexOf('window.submitStockAdjustmentRequest', start);
  const body = source.slice(start, end);
  assert.match(body, /stockAdjustmentApi\.saveAndSubmit\(/);
  assert.doesNotMatch(body, /stockAdjustmentApi\.save\(/);
  assert.doesNotMatch(body, /stockAdjustmentApi\.submit\(/);
  assert.doesNotMatch(source, /from\(['"]van_stocks['"]\)/);
});

test('submission failure preserves products, reason, note and remark until a successful response', () => {
  const start = source.indexOf('window.confirmStockAdjustmentSubmit');
  const end = source.indexOf('window.submitStockAdjustmentRequest', start);
  const body = source.slice(start, end);
  const callIndex = body.indexOf('await stockAdjustmentApi.saveAndSubmit');
  const clearIndex = body.indexOf('clearEditState()');
  assert.ok(callIndex >= 0, 'atomic call should exist');
  assert.ok(clearIndex === -1 || clearIndex > callIndex, 'form state must not clear before the request succeeds');
  const catchIndex = body.indexOf('} catch (error)');
  const catchBody = body.slice(catchIndex);
  assert.doesNotMatch(catchBody, /clearEditState|adjustments\.clear|editMeta\s*=\s*null/);
  assert.match(catchBody, /failedSubmissionMeta = \{ reason, note, remark \}/);
  assert.match(source, /failedSubmissionMeta\?\.reason/);
});
