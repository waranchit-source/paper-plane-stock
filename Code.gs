function doGet(e) {
  var action = e.parameter.action;
  var result = {};
  try {
    if (action === 'getSyncData') {
      return ContentService.createTextOutput(getSyncData(e.parameter.part, e.parameter.sv, e.parameter.lv, e.parameter.force)).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getInitData') result = getInitData();
    else if (action === 'getStockData') result = getStockData();
    else if (action === 'getRecentTransactions') result = getRecentTransactions();
    else if (action === 'getSystemData') result = getSystemData();
    else if (action === 'healthCheck') result = healthCheck();
  } catch (err) {
    result = { success: false, error: true, message: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result = {};
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var args = payload.args || [];

    if (action === 'loginUser') result = loginUser(args[0], args[1]);
    else if (action === 'registerUser') result = registerUser(args[0], args[1], args[2], args[3], args[4]);
    else if (action === 'processBulkTransaction') result = processBulkTransaction(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11]);
    else if (action === 'uploadPhoto') result = uploadPhoto(args[0], args[1]);
    else if (action === 'resolveSubmission') result = resolveSubmission(args[0]);
    else if (action === 'deleteTransactions') result = deleteTransactions(args[0]);
    else if (action === 'editTransaction') result = editTransaction(args[0], args[1]);
  } catch (err) {
    result = { success: false, message: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function authorizeDriveAccess() {
  DriveApp.createFolder('PaperPlane_Test_Folder_Please_Delete');
  SpreadsheetApp.getActiveSpreadsheet();
  return "Authorized Successfully";
}

function getSheetData(sheetName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    return sheet.getDataRange().getDisplayValues() || [];
  } catch(e) {
    return [];
  }
}

function setupSystemSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('Users')) ss.insertSheet('Users').appendRow(['User_ID', 'Password', 'First_Name', 'Last_Name', 'Branch', 'Role', 'Approved']);
  if (!ss.getSheetByName('Inventory_Transaction')) ss.insertSheet('Inventory_Transaction').appendRow(['Timestamp', 'Transaction_ID', 'Type', 'Doc_Ref', 'SKU', 'Item_Name', 'Qty', 'From_Branch', 'To_Branch', 'User', 'Invoice_No', 'Remark', 'Photo_URL', 'In_Charge']);
  if (!ss.getSheetByName('Stock_Balance')) ss.insertSheet('Stock_Balance').appendRow(['SKU', 'Item_Name', 'Branch', 'Quantity', 'Last_Updated']);
  if (!ss.getSheetByName('In charge')) ss.insertSheet('In charge').appendRow(['Name', 'Branch']);
}

function cleanKey(str) {
  return String(str).toUpperCase().replace(/\s+/g, '');
}

function getColIndex(headers, possibleNames) {
  for (var j = 0; j < headers.length; j++) {
    var val = String(headers[j]).toUpperCase().replace(/[\s_()-]/g, '');
    for (var k = 0; k < possibleNames.length; k++) {
      if (val === String(possibleNames[k]).toUpperCase().replace(/[\s_()-]/g, '')) return j;
    }
  }
  return -1;
}

function ppIsSaneDate(d) {
  if (!d || isNaN(d.getTime())) return false;
  var year = d.getFullYear();
  return year >= 2000 && year <= 2100;
}

function ppApplyTxDate(timestamp, txDate) {
  if (txDate) {
    var parsed = new Date(txDate);
    if (ppIsSaneDate(parsed)) {
      timestamp.setFullYear(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }
  if (!ppIsSaneDate(timestamp)) return new Date();
  return timestamp;
}

function ppTimeFromTxId(txId) {
  var m = /^TXN(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_/.exec(String(txId || ''));
  if (!m) return '';
  if (parseInt(m[2], 10) < 1 || parseInt(m[2], 10) > 12 || parseInt(m[3], 10) < 1 || parseInt(m[3], 10) > 31 || parseInt(m[4], 10) > 23 || parseInt(m[5], 10) > 59 || parseInt(m[6], 10) > 59) return '';
  return parseInt(m[2], 10) + '/' + parseInt(m[3], 10) + '/' + m[1] + ' ' + parseInt(m[4], 10) + ':' + m[5] + ':' + m[6];
}

function registerUser(id, password, fname, lname, branch) {
  setupSystemSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  var data = sheet.getDataRange().getValues();
  var h = data[0] || [];
  var idCol = getColIndex(h, ['USERID']);
  var brCol = getColIndex(h, ['BRANCH']);
  if (idCol === -1) idCol = 0;
  if (brCol === -1) brCol = 4;

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === id && String(data[i][brCol]).trim() === branch) {
      return { success: false, message: 'ID นี้ได้ลงทะเบียนในสาขานี้ไปแล้วครับ' };
    }
  }
  sheet.appendRow([id, password, fname, lname, branch, 'User', 'Pending']);
  return { success: true, message: 'ลงทะเบียนสำเร็จ! กรุณารอ Admin อนุมัติสิทธิ์เข้าใช้งาน' };
}

function loginUser(id, password) {
  setupSystemSheets();
  var data = getSheetData('Users');
  if(data.length < 2) return { success: false, message: 'ไม่มีข้อมูลผู้ใช้งานในระบบ' };
  var h = data[0];
  var idCol = getColIndex(h, ['USERID']);
  var pwdCol = getColIndex(h, ['PASSWORD']);
  var fnCol = getColIndex(h, ['FIRSTNAME']);
  var lnCol = getColIndex(h, ['LASTNAME']);
  var brCol = getColIndex(h, ['BRANCH']);
  var roleCol = getColIndex(h, ['ROLE']);
  var appCol = getColIndex(h, ['APPROVED']);
  var matchedRows = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === id && data[i][pwdCol] === password) {
      matchedRows.push(data[i]);
    }
  }
  if (matchedRows.length === 0) return { success: false, message: 'ID หรือ Password ไม่ถูกต้อง' };
  var approvedRows = [];
  for (var i = 0; i < matchedRows.length; i++) {
    var isApp = false;
    if (appCol > -1) {
      var st = String(matchedRows[i][appCol]).toUpperCase().replace(/\s+/g, '');
      if (st === 'YES' || st === 'APPROVED' || st === 'อนุมัติ' || st === 'TRUE') isApp = true;
    } else { isApp = true; }
    if (isApp) approvedRows.push(matchedRows[i]);
  }
  if (approvedRows.length === 0) return { success: false, message: 'บัญชีของคุณยังไม่ได้รับการอนุมัติ กรุณาติดต่อ Admin' };
  var baseRow = approvedRows[0];
  var finalRole = 'User';
  var branches = [];
  for (var i = 0; i < approvedRows.length; i++) {
    var b = String(approvedRows[i][brCol]).trim();
    var r = roleCol > -1 ? String(approvedRows[i][roleCol]).trim() : 'User';
    if (b && branches.indexOf(b) === -1) branches.push(b);

    if (r.toUpperCase() === 'ADMIN' || b.toUpperCase() === 'ALL') finalRole = 'Admin';
    else if (r.toUpperCase() === 'MANAGER' && finalRole !== 'Admin') finalRole = 'Manager';
  }
  return {
    success: true,
    user: {
      id: baseRow[idCol],
      fname: baseRow[fnCol],
      lname: baseRow[lnCol],
      branch: branches.length === 1 ? branches[0] : branches.join(', '),
      branches: branches,
      role: finalRole
    }
  };
}

function buildStaticData() {
  setupSystemSheets();
  var branchData = getSheetData('Branches');
  var branches = [];
  for (var i = 1; i < branchData.length; i++) {
    if (branchData[i][0]) branches.push(String(branchData[i][0]).trim());
  }
  var inChargeData = getSheetData('In charge');
  var inCharges = [];
  for (var i = 1; i < inChargeData.length; i++) {
    if (inChargeData[i][0] && String(inChargeData[i][0]).trim().toUpperCase() !== 'NAME') {
      inCharges.push({
        name: String(inChargeData[i][0]).trim(),
        branch: String(inChargeData[i][1] || '').trim()
      });
    }
  }

  var masterData = getSheetData('Master data');
  var skus = [];
  if (masterData.length > 0) {
    var h = masterData[0];
    var skuCol = getColIndex(h, ['SKU', 'รหัสสินค้า', 'รหัส']);
    var nameCol = getColIndex(h, ['ITEMNAME', 'PRODUCTNAME', 'ชื่อสินค้า', 'ชื่อรายการ', 'NAME']);
    var uomCol = getColIndex(h, ['UOM', 'หน่วย', 'หน่วยนับ']);
    var bcCol = getColIndex(h, ['BARCODE', 'บาร์โค้ด']);
    for (var i = 1; i < masterData.length; i++) {
      if (skuCol > -1 && masterData[i][skuCol]) {
        skus.push({
          sku: String(masterData[i][skuCol] || '').trim(),
          name: nameCol > -1 ? String(masterData[i][nameCol] || '').trim() : '',
          uom: uomCol > -1 ? String(masterData[i][uomCol] || '').trim() : '-',
          barcode: bcCol > -1 ? String(masterData[i][bcCol] || '').trim() : ''
        });
      }
    }
  }
  return { branches: branches, inCharges: inCharges, skus: skus };
}

function buildPoData(txData) {
  var poData = getSheetData('PO Management');
  var pos = [];
  if (poData.length > 0) {
    var headers = poData[0];
    var poCol = getColIndex(headers, ['PONUMBER', 'PONO', 'PO', 'เลขที่PO']);
    var dateCol = getColIndex(headers, ['DELIVERYDATE', 'DATE', 'วันที่ต้องการสินค้า', 'วันที่จัดส่ง']);
    var supCol = getColIndex(headers, ['SUPPLIER', 'VENDOR', 'ผู้ขาย']);
    var branchCol = getColIndex(headers, ['BRANCH', 'สาขา', 'บริษัทผู้ซื้อ', 'บริษัท']);
    var poSkuCol = getColIndex(headers, ['ITEMNAMESKU', 'SKU', 'รหัสสินค้า', 'รหัส']);
    var poNameCol = getColIndex(headers, ['PRODUCTNAME', 'ITEMNAME', 'ชื่อสินค้า', 'รายการสินค้า', 'รายการ', 'NAME']);
    var qtyCol = getColIndex(headers, ['QTY', 'QUANTITY', 'จำนวน']);
    for (var i = 1; i < poData.length; i++) {
      if (poCol > -1 && poData[i][poCol]) {
        var rawQty = String(poData[i][qtyCol] || '0').replace(/,/g, '');
        var rawSkuName = String(poData[i][poSkuCol] || '').trim();
        var finalSku = rawSkuName;
        var finalName = poNameCol > -1 ? String(poData[i][poNameCol]).trim() : '';
        if (rawSkuName.indexOf(' ') > -1 && (!finalName || poSkuCol === poNameCol)) {
          var parts = rawSkuName.split(' ');
          finalSku = parts[0];
          finalName = parts.slice(1).join(' ');
        }
        pos.push({
          po: String(poData[i][poCol]).trim(),
          date: dateCol > -1 ? String(poData[i][dateCol]).trim() : '',
          supplier: supCol > -1 ? String(poData[i][supCol]).trim() : '',
          branch: branchCol > -1 ? String(poData[i][branchCol]).trim() : '',
          sku: finalSku,
          name: finalName,
          qty: qtyCol > -1 ? (parseFloat(rawQty) || 0) : 0
        });
      }
    }
  }
  var poReceives = {};
  if (txData.length > 0) {
    var h = txData[0];
    var typeCol = getColIndex(h, ['TYPE']);
    var refCol = getColIndex(h, ['DOCREF', 'REFNO', 'REF', 'PO', 'INVOICE']);
    var skuColTx = getColIndex(h, ['SKU', 'รหัส']);
    var qtyColTx = getColIndex(h, ['QTY', 'QUANTITY', 'จำนวน']);
    if(typeCol > -1 && refCol > -1 && skuColTx > -1 && qtyColTx > -1) {
      for(var i = 1; i < txData.length; i++) {
        if(cleanKey(txData[i][typeCol]) === 'INBOUND' && txData[i][refCol]) {
          var poKey = cleanKey(txData[i][refCol]);
          var skuKey = cleanKey(txData[i][skuColTx]);
          var key = poKey + '_' + skuKey;
          var rawQ = String(txData[i][qtyColTx] || '0').replace(/,/g, '');
          var q = parseFloat(rawQ) || 0;
          poReceives[key] = (poReceives[key] || 0) + q;
        }
      }
    }
  }
  return { pos: pos, poReceives: poReceives };
}

function buildLiveData() {
  var txData = getSheetData('Inventory_Transaction');
  var poPart = buildPoData(txData);
  return { pos: poPart.pos, poReceives: poPart.poReceives, stock: getStockData(), history: buildRecentTransactions(txData) };
}

function getSystemData() {
  var st = buildStaticData();
  var poPart = buildPoData(getSheetData('Inventory_Transaction'));
  return { branches: st.branches, inCharges: st.inCharges, skus: st.skus, pos: poPart.pos, poReceives: poPart.poReceives };
}

function getInitData() {
  try {
    var st = JSON.parse(getCachedPart('PP_STATIC', '', false, 120, buildStaticData)).data;
    var lv = JSON.parse(getCachedPart('PP_LIVE', '', false, 20, buildLiveData)).data;
    return {
      sys: { branches: st.branches, inCharges: st.inCharges, skus: st.skus, pos: lv.pos, poReceives: lv.poReceives },
      stock: lv.stock,
      history: lv.history
    };
  } catch(e) {
    return null;
  }
}

function getSyncData(part, staticVer, liveVer, force) {
  var isForce = String(force) === '1';
  var out = [];
  if (part !== 'live') out.push('"static":' + getCachedPart('PP_STATIC', staticVer, isForce, 120, buildStaticData));
  if (part !== 'static') out.push('"live":' + getCachedPart('PP_LIVE', liveVer, isForce, 20, buildLiveData));
  return '{' + out.join(',') + '}';
}

function getCachedPart(key, clientVer, force, ttl, builder) {
  var cache = CacheService.getScriptCache();
  var meta = {};
  try { meta = cache.getAll([key + '_V', key + '_F', key + '_B', key + '_G']) || {}; } catch (err) {}
  var genBefore = meta[key + '_G'] || '';
  if (!force) {
    var ver = meta[key + '_V'];
    if (ver) {
      if (meta[key + '_F'] || meta[key + '_B']) {
        if (clientVer && clientVer === ver) return JSON.stringify({ ver: ver, unchanged: true });
        var cached = ppCacheGet(key);
        if (cached) return cached;
      }
      try { cache.put(key + '_B', '1', 20); } catch (err) {}
    }
  }
  var dataJson = JSON.stringify(builder());
  var newVer = ppDigest(dataJson);
  var json = '{"ver":"' + newVer + '","data":' + dataJson + '}';
  var genAfter = '';
  try { genAfter = cache.get(key + '_G') || ''; } catch (err) {}
  if (genAfter === genBefore) {
    try { ppCachePut(key, json, newVer, ttl); } catch (err) {}
  }
  try { cache.remove(key + '_B'); } catch (err) {}
  if (!force && clientVer && clientVer === newVer) return JSON.stringify({ ver: newVer, unchanged: true });
  return json;
}

function ppDigest(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function ppCachePut(key, str, ver, ttl) {
  var cache = CacheService.getScriptCache();
  var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(str, 'application/json', 'data.json')).getBytes());
  var size = 90000;
  var n = Math.ceil(b64.length / size);
  var obj = {};
  for (var i = 0; i < n; i++) obj[key + '_' + i] = b64.substr(i * size, size);
  obj[key + '_N'] = String(n);
  obj[key + '_V'] = ver;
  cache.putAll(obj, ttl * 6);
  cache.put(key + '_F', '1', ttl);
}

function ppCacheGet(key) {
  try {
    var cache = CacheService.getScriptCache();
    var n = parseInt(cache.get(key + '_N'), 10);
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + '_' + i);
    var parts = cache.getAll(keys);
    var b64 = '';
    for (var j = 0; j < n; j++) {
      if (!parts[keys[j]]) return null;
      b64 += parts[keys[j]];
    }
    return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip', 'data.json.gz')).getDataAsString();
  } catch (err) {
    return null;
  }
}

function invalidateLiveCache() {
  try {
    var cache = CacheService.getScriptCache();
    cache.put('PP_LIVE_G', String(new Date().getTime()) + '_' + Math.floor(Math.random() * 100000), 21600);
    cache.removeAll(['PP_LIVE_V', 'PP_LIVE_N', 'PP_LIVE_F', 'PP_LIVE_B']);
  } catch (err) {}
}

function healthCheck() {
  var out = { ok: true, cache: false, lock: false, props: false };
  try {
    var c = CacheService.getScriptCache();
    c.put('PP_HEALTH', '1', 60);
    out.cache = c.get('PP_HEALTH') === '1';
  } catch (err) { out.cacheError = err.toString(); }
  try {
    var l = LockService.getScriptLock();
    out.lock = l.tryLock(1000);
    if (out.lock) l.releaseLock();
  } catch (err) { out.lockError = err.toString(); }
  try {
    PropertiesService.getScriptProperties().getProperty('PP_HEALTH');
    out.props = true;
  } catch (err) { out.propsError = err.toString(); }
  return out;
}

function getRequestState(requestId) {
  var key = 'REQ_' + requestId;
  var val = null;
  try { val = CacheService.getScriptCache().get(key); } catch (err) {}
  if (!val) {
    try { val = PropertiesService.getScriptProperties().getProperty(key); } catch (err) {}
  }
  if (!val) return '';
  return String(val).split('|')[0];
}

function setRequestState(requestId, state) {
  var key = 'REQ_' + requestId;
  var ok = false;
  try {
    CacheService.getScriptCache().put(key, state, 21600);
    ok = true;
  } catch (err) {}
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(key, state + '|' + new Date().getTime());
    ok = true;
    if (Math.random() < 0.05) pruneRequestStates(props);
  } catch (err) {}
  return ok;
}

function pruneRequestStates(props) {
  var all = props.getProperties();
  var cutoff = new Date().getTime() - (3 * 24 * 60 * 60 * 1000);
  for (var k in all) {
    if (k.indexOf('REQ_') === 0) {
      var ts = parseInt(String(all[k]).split('|')[1], 10) || 0;
      if (ts < cutoff) props.deleteProperty(k);
    }
  }
}

function resolveSubmission(requestId) {
  if (!requestId) return { success: false, message: 'Missing requestId' };
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return { success: false, message: 'ระบบกำลังบันทึกรายการอื่นอยู่ ยังตรวจสอบผลไม่ได้ กรุณาลองใหม่อีกครั้ง' };
  }
  try {
    var state = getRequestState(requestId);
    if (state.indexOf('DONE') === 0) return { success: true, status: 'committed', txId: state.split(':')[1] || '' };
    if (!setRequestState(requestId, 'CANCELLED')) return { success: false, message: 'ไม่สามารถบันทึกสถานะการยกเลิกได้ กรุณาลองใหม่อีกครั้ง' };
    return { success: true, status: 'cancelled' };
  } catch (e) {
    return { success: false, message: e.message || e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function getReceiptFolder() {
  var cache = CacheService.getScriptCache();
  var id = null;
  try { id = cache.get('PP_RECEIPT_FOLDER_ID'); } catch (err) {}
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) {}
  }
  var folders = DriveApp.getFoldersByName('PaperPlane_Receipts');
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('PaperPlane_Receipts');
  try { cache.put('PP_RECEIPT_FOLDER_ID', folder.getId(), 21600); } catch (err) {}
  return folder;
}

function uploadToDrive(base64Data, filename) {
  try {
    if(!base64Data) return '';
    var data = base64Data.split(',');
    var mimeType = data[0].match(/:(.*?);/)[1];
    var byteCharacters = Utilities.base64Decode(data[1]);
    var blob = Utilities.newBlob(byteCharacters, mimeType, filename + '.jpg');
    var folder = getReceiptFolder();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch(e) {
    return 'Upload Error: ' + e.message;
  }
}

function uploadPhoto(base64Data, filename) {
  if (!base64Data) return { success: false, message: 'ไม่พบข้อมูลรูปภาพ' };
  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
  var safeName = String(filename || 'TXN').replace(/[\\\/:*?"<>|\s]/g, '_');
  var url = uploadToDrive(base64Data, safeName + '_' + ts);
  if (!url || url.indexOf('Upload Error') > -1) return { success: false, message: url || 'Upload Error' };
  return { success: true, url: url };
}

function ppError(message, retryable, partial) {
  var err = new Error(message);
  err.retryable = retryable;
  err.partial = partial === true;
  return err;
}

function invertAdjustments(adjustments) {
  return adjustments.map(function(adj) {
    return { sku: adj.sku, name: adj.name, branch: adj.branch, amount: -adj.amount };
  });
}

function rollbackTransactionRows(txSheet, startRow, count, txId) {
  var ids = txSheet.getRange(startRow, 2, count, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() !== txId) return false;
  }
  txSheet.deleteRows(startRow, count);
  SpreadsheetApp.flush();
  return true;
}

function processBulkTransaction(type, docRef, invoiceNo, remark, items, targetBranch, fromBranch, userStr, txDate, inCharge, formPhotoBase64, requestId) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    if (!items || !items.length) throw ppError('ไม่มีรายการสินค้าในคำขอ', false);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var txSheet = ss.getSheetByName('Inventory_Transaction');
    var globalPhotoUrl = '';

    if (formPhotoBase64) {
      var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
      globalPhotoUrl = uploadToDrive(formPhotoBase64, 'INBOUND_' + ts);
      if (globalPhotoUrl.indexOf('Upload Error') > -1) throw new Error(globalPhotoUrl);
    }

    var photoUrls = [];
    for (var p = 0; p < items.length; p++) {
      var itemPhotoUrl = items[p].photoUrl || globalPhotoUrl;
      if (items[p].photoBase64) {
        var ts2 = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
        itemPhotoUrl = uploadToDrive(items[p].photoBase64, 'TXN_' + items[p].sku + '_' + ts2);
        if (itemPhotoUrl.indexOf('Upload Error') > -1) throw new Error(itemPhotoUrl);
      }
      photoUrls.push(itemPhotoUrl);
    }

    try {
      lock.waitLock(30000);
      hasLock = true;
    } catch (lockErr) {
      throw ppError('ระบบกำลังบันทึกรายการอื่นอยู่ (คิวเต็ม) รายการนี้ยังไม่ถูกบันทึก กรุณาลองใหม่อีกครั้ง', true);
    }

    if (requestId) {
      var state = getRequestState(requestId);
      if (state.indexOf('DONE') === 0) return { success: true, duplicate: true, txId: state.split(':')[1] || '' };
      if (state === 'CANCELLED') return { success: false, cancelled: true, retryable: true, message: 'คำขอนี้ถูกยกเลิกไปแล้ว รายการยังไม่ถูกบันทึก กรุณากดยืนยันใหม่อีกครั้ง' };
    }

    var commonTxId = 'TXN' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMddHHmmss") + '_' + Math.floor(Math.random() * 1000);
    var stockAdjustments = [];
    var newRows = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var itemQty = parseFloat(item.qty);
      if (!item.sku || isNaN(itemQty)) throw ppError('ข้อมูลสินค้าลำดับที่ ' + (i + 1) + ' ไม่ถูกต้อง (ไม่มีรหัสสินค้าหรือจำนวน)', false);
      var timestamp = ppApplyTxDate(new Date(), txDate);

      var refToSave = item.po ? item.po : docRef;
      var photoUrl = photoUrls[i];

      newRows.push([timestamp, commonTxId, type, refToSave, item.sku, item.name, itemQty, fromBranch, targetBranch, userStr, invoiceNo, remark, photoUrl, inCharge]);

      var typeNorm = cleanKey(type);
      var isAddition = ['INBOUND', 'RETURNTOSTOCK', 'FOCINBOUND'].indexOf(typeNorm) > -1;
      var isDeduction = ['OUTBOUND', 'ENTERTAIN', 'RD', 'FOCOUTBOUND'].indexOf(typeNorm) > -1;
      if (typeNorm !== 'STOCKCOUNT') {
        if (isAddition) {
          var tBranch = targetBranch || fromBranch;
          stockAdjustments.push({sku: item.sku, name: item.name, branch: tBranch, amount: itemQty});
        } else if (isDeduction) {
          stockAdjustments.push({sku: item.sku, name: item.name, branch: fromBranch, amount: -itemQty});
        } else if (typeNorm === 'TRANSFER') {
          stockAdjustments.push({sku: item.sku, name: item.name, branch: fromBranch, amount: -itemQty});
          stockAdjustments.push({sku: item.sku, name: item.name, branch: targetBranch, amount: itemQty});
        }
      }
    }

    var startRow = txSheet.getLastRow() + 1;
    txSheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);

    var stockApplied = false;
    try {
      applyStockAdjustments(ss, stockAdjustments);
      stockApplied = true;
      SpreadsheetApp.flush();
    } catch (stockErr) {
      if (stockApplied) {
        try { applyStockAdjustments(ss, invertAdjustments(stockAdjustments)); } catch (revertErr) {}
      }
      var rolledBack = false;
      try { rolledBack = rollbackTransactionRows(txSheet, startRow, newRows.length, commonTxId); } catch (rbErr) {}
      if (rolledBack) throw ppError('ปรับยอดสต็อกไม่สำเร็จ ระบบยกเลิกรายการชุดนี้ทั้งหมดแล้ว ยังไม่มีข้อมูลถูกบันทึก (' + (stockErr.message || stockErr.toString()) + ')', true);
      throw ppError('ปรับยอดสต็อกไม่สำเร็จ และยกเลิกรายการอัตโนมัติไม่ได้ กรุณาแจ้ง Admin ตรวจสอบรายการ ' + commonTxId + ' (' + (stockErr.message || stockErr.toString()) + ')', false, true);
    }

    if (requestId) setRequestState(requestId, 'DONE:' + commonTxId);
    invalidateLiveCache();
    return { success: true, txId: commonTxId };

  } catch (e) {
    return { success: false, message: e.message || e.toString(), retryable: e.retryable !== false, partial: e.partial === true };
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (err) {}
    }
  }
}

function deleteTransactions(targets) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    try {
      lock.waitLock(30000);
      hasLock = true;
    } catch (lockErr) {
      throw new Error('ระบบกำลังบันทึกรายการอื่นอยู่ ยังไม่ได้ลบรายการ กรุณาลองใหม่อีกครั้ง');
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var txSheet = ss.getSheetByName('Inventory_Transaction');
    var txData = txSheet.getDataRange().getValues();
    if (txData.length < 2) return { success: false, message: 'No data' };

    var h = txData[0];
    var idCol = getColIndex(h, ['TRANSACTIONID', 'ID']);
    var skuCol = getColIndex(h, ['SKU', 'รหัส']);
    var typeCol = getColIndex(h, ['TYPE']);
    var qtyCol = getColIndex(h, ['QTY', 'QUANTITY', 'จำนวน']);
    var fbCol = getColIndex(h, ['FROMBRANCH', 'FROM']);
    var tbCol = getColIndex(h, ['TOBRANCH', 'TO']);
    var rowsToDelete = [];
    var stockAdjustments = [];
    for (var i = txData.length - 1; i > 0; i--) {
      var rowTxId = String(txData[i][idCol]).trim();
      var rowSku = String(txData[i][skuCol]).trim();

      var match = targets.find(function(t) { return t.txId === rowTxId && t.sku === rowSku; });
      if (match) {
        rowsToDelete.push(i + 1);

        var typeNorm = String(txData[i][typeCol]).toUpperCase().replace(/\s+/g, '');
        var qty = parseFloat(String(txData[i][qtyCol]).replace(/,/g, '')) || 0;
        var fBranch = String(txData[i][fbCol]).trim();
        var tBranch = String(txData[i][tbCol]).trim();

        var isAddition = ['INBOUND', 'RETURNTOSTOCK', 'FOCINBOUND'].indexOf(typeNorm) > -1;
        var isDeduction = ['OUTBOUND', 'ENTERTAIN', 'RD', 'FOCOUTBOUND'].indexOf(typeNorm) > -1;

        if (typeNorm !== 'STOCKCOUNT') {
          if (isAddition) {
            var targetBranch = tBranch || fBranch;
            stockAdjustments.push({sku: rowSku, branch: targetBranch, amount: -qty});
          } else if (isDeduction) {
            stockAdjustments.push({sku: rowSku, branch: fBranch, amount: qty});
          } else if (typeNorm === 'TRANSFER') {
            stockAdjustments.push({sku: rowSku, branch: fBranch, amount: qty});
            stockAdjustments.push({sku: rowSku, branch: tBranch, amount: -qty});
          }
        }
      }
    }
    rowsToDelete.sort(function(a, b){return b - a;});
    rowsToDelete.forEach(function(rowIdx) {
      txSheet.deleteRow(rowIdx);
    });

    applyStockAdjustments(ss, stockAdjustments);
    invalidateLiveCache();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || e.toString() };
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (err) {}
    }
  }
}

function editTransaction(target, newData) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    try {
      lock.waitLock(30000);
      hasLock = true;
    } catch (lockErr) {
      throw new Error('ระบบกำลังบันทึกรายการอื่นอยู่ ยังไม่ได้แก้ไขรายการ กรุณาลองใหม่อีกครั้ง');
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var txSheet = ss.getSheetByName('Inventory_Transaction');
    var txData = txSheet.getDataRange().getValues();
    if (txData.length < 2) return { success: false, message: 'No data' };

    var h = txData[0];
    var idCol = getColIndex(h, ['TRANSACTIONID', 'ID']);
    var skuCol = getColIndex(h, ['SKU', 'รหัส']);
    var dateCol = getColIndex(h, ['TIMESTAMP', 'DATE', 'เวลา']);
    var typeCol = getColIndex(h, ['TYPE']);
    var nameCol = getColIndex(h, ['ITEMNAME', 'NAME', 'ชื่อสินค้า']);
    var qtyCol = getColIndex(h, ['QTY', 'QUANTITY', 'จำนวน']);
    var fbCol = getColIndex(h, ['FROMBRANCH', 'FROM']);
    var tbCol = getColIndex(h, ['TOBRANCH', 'TO']);

    var stockAdjustments = [];
    var rowIndex = -1;
    for (var i = txData.length - 1; i > 0; i--) {
      var rowTxId = String(txData[i][idCol]).trim();
      var rowSku = String(txData[i][skuCol]).trim();

      if (rowTxId === target.txId && rowSku === target.sku) {
        rowIndex = i + 1;
        var oldType = String(txData[i][typeCol]).toUpperCase().replace(/\s+/g, '');
        var oldQty = parseFloat(String(txData[i][qtyCol]).replace(/,/g, '')) || 0;
        var fBranch = String(txData[i][fbCol]).trim();
        var tBranch = String(txData[i][tbCol]).trim();
        var newTBranch = tBranch;
        if (tbCol > -1 && newData.toBranch !== undefined && newData.toBranch !== null) newTBranch = String(newData.toBranch).trim();

        var isOldAdd = ['INBOUND', 'RETURNTOSTOCK', 'FOCINBOUND'].indexOf(oldType) > -1;
        var isOldSub = ['OUTBOUND', 'ENTERTAIN', 'RD', 'FOCOUTBOUND'].indexOf(oldType) > -1;
        if (oldType !== 'STOCKCOUNT') {
          if (isOldAdd) {
            var targetBranch = tBranch || fBranch;
            stockAdjustments.push({sku: rowSku, name: txData[i][nameCol], branch: targetBranch, amount: -oldQty});
          } else if (isOldSub) {
            stockAdjustments.push({sku: rowSku, name: txData[i][nameCol], branch: fBranch, amount: oldQty});
          } else if (oldType === 'TRANSFER') {
            stockAdjustments.push({sku: rowSku, name: txData[i][nameCol], branch: fBranch, amount: oldQty});
            stockAdjustments.push({sku: rowSku, name: txData[i][nameCol], branch: tBranch, amount: -oldQty});
          }
        }
        var newDate = new Date(newData.date);
        if (!ppIsSaneDate(newDate)) newDate = txData[i][dateCol];

        var newTypeNorm = String(newData.type).toUpperCase().replace(/\s+/g, '');
        var newQtyNum = parseFloat(newData.qty) || 0;
        var isNewAdd = ['INBOUND', 'RETURNTOSTOCK', 'FOCINBOUND'].indexOf(newTypeNorm) > -1;
        var isNewSub = ['OUTBOUND', 'ENTERTAIN', 'RD', 'FOCOUTBOUND'].indexOf(newTypeNorm) > -1;
        if (newTypeNorm !== 'STOCKCOUNT') {
          if (isNewAdd) {
            var targetBranchNew = newTBranch || fBranch;
            stockAdjustments.push({sku: newData.sku, name: newData.name, branch: targetBranchNew, amount: newQtyNum});
          } else if (isNewSub) {
            stockAdjustments.push({sku: newData.sku, name: newData.name, branch: fBranch, amount: -newQtyNum});
          } else if (newTypeNorm === 'TRANSFER') {
            stockAdjustments.push({sku: newData.sku, name: newData.name, branch: fBranch, amount: -newQtyNum});
            stockAdjustments.push({sku: newData.sku, name: newData.name, branch: newTBranch, amount: newQtyNum});
          }
        }

        applyStockAdjustments(ss, stockAdjustments);
        try {
          txSheet.getRange(rowIndex, dateCol + 1).setValue(newDate);
          txSheet.getRange(rowIndex, typeCol + 1).setValue(newData.type);
          txSheet.getRange(rowIndex, skuCol + 1).setValue(newData.sku);
          txSheet.getRange(rowIndex, nameCol + 1).setValue(newData.name);
          txSheet.getRange(rowIndex, qtyCol + 1).setValue(newData.qty);
          if (tbCol > -1 && newTBranch !== tBranch) txSheet.getRange(rowIndex, tbCol + 1).setValue(newTBranch);
          SpreadsheetApp.flush();
        } catch (rowErr) {
          try { applyStockAdjustments(ss, invertAdjustments(stockAdjustments)); } catch (revertErr) {}
          throw new Error('แก้ไขรายการไม่สำเร็จ ระบบคืนยอดสต็อกกลับเหมือนเดิมแล้ว (' + (rowErr.message || rowErr.toString()) + ')');
        }
        break;
      }
    }
    if (rowIndex > -1) {
      invalidateLiveCache();
      return { success: true };
    } else {
      return { success: false, message: 'Transaction not found' };
    }
  } catch (e) {
    return { success: false, message: e.message || e.toString() };
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (err) {}
    }
  }
}

function onSheetChangeTrigger(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== 'Inventory_Transaction') return;

  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (row <= 1) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var qtyColIdx = getColIndex(headers, ['QTY', 'QUANTITY', 'จำนวน']) + 1;

  if (col === qtyColIdx) {
    var oldVal = parseFloat(e.oldValue) || 0;
    var newVal = parseFloat(e.value) || 0;
    var delta = newVal - oldVal;

    if (delta === 0) return;

    var typeColIdx = getColIndex(headers, ['TYPE']) + 1;
    var skuColIdx = getColIndex(headers, ['SKU', 'รหัส']) + 1;
    var fbColIdx = getColIndex(headers, ['FROMBRANCH', 'FROM']) + 1;
    var tbColIdx = getColIndex(headers, ['TOBRANCH', 'TO']) + 1;
    var nameColIdx = getColIndex(headers, ['ITEMNAME', 'NAME', 'ชื่อสินค้า']) + 1;

    var typeNorm = String(sheet.getRange(row, typeColIdx).getValue()).toUpperCase().replace(/\s+/g, '');
    var sku = String(sheet.getRange(row, skuColIdx).getValue()).trim();
    var itemName = String(sheet.getRange(row, nameColIdx).getValue()).trim();
    var fBranch = String(sheet.getRange(row, fbColIdx).getValue()).trim();
    var tBranch = String(sheet.getRange(row, tbColIdx).getValue()).trim();

    if (typeNorm === 'STOCKCOUNT' || !sku) return;

    var isAdd = ['INBOUND', 'RETURNTOSTOCK', 'FOCINBOUND'].indexOf(typeNorm) > -1;
    var isSub = ['OUTBOUND', 'ENTERTAIN', 'RD', 'FOCOUTBOUND'].indexOf(typeNorm) > -1;

    var adjustments = [];
    if (isAdd) {
      var targetBranch = tBranch || fBranch;
      adjustments.push({sku: sku, name: itemName, branch: targetBranch, amount: delta});
    } else if (isSub) {
      adjustments.push({sku: sku, name: itemName, branch: fBranch, amount: -delta});
    } else if (typeNorm === 'TRANSFER') {
      adjustments.push({sku: sku, name: itemName, branch: fBranch, amount: -delta});
      adjustments.push({sku: sku, name: itemName, branch: tBranch, amount: delta});
    }

    var ss = e.source;
    applyStockAdjustments(ss, adjustments);
  }
}

function applyStockAdjustments(ss, adjustments) {
  if (adjustments.length === 0) return;
  var stockSheet = ss.getSheetByName('Stock_Balance');
  var stockData = stockSheet.getDataRange().getValues();

  var adjMap = {};
  var nameMap = {};
  adjustments.forEach(function(adj) {
    if (!adj.branch) return;
    var key = adj.sku + '|' + adj.branch;
    adjMap[key] = (adjMap[key] || 0) + adj.amount;
    if (adj.name && !nameMap[adj.sku]) nameMap[adj.sku] = adj.name;
  });

  var now = new Date();
  var applied = [];
  var newRows = [];
  try {
    for (var key in adjMap) {
      var parts = key.split('|');
      var sku = parts[0];
      var branch = parts[1];
      var amount = adjMap[key];
      if (amount === 0) continue;
      var found = false;
      for (var i = 1; i < stockData.length; i++) {
        if (String(stockData[i][0]).trim() === sku && String(stockData[i][2]).trim() === branch) {
          var currentQty = parseFloat(String(stockData[i][3]).replace(/,/g, '')) || 0;
          stockSheet.getRange(i + 1, 4, 1, 2).setValues([[currentQty + amount, now]]);
          applied.push({ row: i + 1, qty: stockData[i][3], updated: stockData[i][4] });
          found = true;
          break;
        }
      }
      if (!found) {
        newRows.push([sku, nameMap[sku] || '', branch, amount, now]);
      }
    }
    if (newRows.length > 0) {
      stockSheet.getRange(stockSheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
    }
  } catch (err) {
    for (var j = applied.length - 1; j >= 0; j--) {
      try { stockSheet.getRange(applied[j].row, 4, 1, 2).setValues([[applied[j].qty, applied[j].updated]]); } catch (undoErr) {}
    }
    throw err;
  }
}

function getStockData() {
  var data = getSheetData('Stock_Balance');
  var result = [];
  for(var i = 1; i < data.length; i++) {
    if(data[i][0]) {
      var rawQ = String(data[i][3] || '0').replace(/,/g, '');
      result.push({
        sku: String(data[i][0]||'').trim(),
        name: String(data[i][1]||'').trim(),
        branch: String(data[i][2]||'').trim(),
        qty: parseFloat(rawQ) || 0,
        updated: String(data[i][4]||'').trim()
      });
    }
  }
  return result;
}

function getRecentTransactions() {
  return buildRecentTransactions(getSheetData('Inventory_Transaction'));
}

function buildRecentTransactions(data) {
  var result = [];
  var limit = Math.max(1, data.length - 2000);

  if(data.length > 0) {
    var h = data[0];
    var idCol = getColIndex(h, ['TRANSACTIONID', 'ID']);
    var typeCol = getColIndex(h, ['TYPE']);
    var refCol = getColIndex(h, ['DOCREF', 'REFNO', 'REF', 'PO', 'INVOICE']);
    var skuCol = getColIndex(h, ['SKU', 'รหัส']);
    var nameCol = getColIndex(h, ['ITEMNAME', 'NAME', 'ชื่อสินค้า']);
    var qtyCol = getColIndex(h, ['QTY', 'QUANTITY', 'จำนวน']);
    var fbCol = getColIndex(h, ['FROMBRANCH', 'FROM']);
    var tbCol = getColIndex(h, ['TOBRANCH', 'TO']);
    var userCol = getColIndex(h, ['USER', 'ผู้ทำรายการ']);
    var urlCol = getColIndex(h, ['PHOTOURL', 'PHOTO']);
    var inChargeCol = getColIndex(h, ['INCHARGE', 'ผู้รับผิดชอบ']);
  }
  for(var i = data.length - 1; i >= limit; i--) {
    var rowTime = String(data[i][0] || '');
    if(!rowTime && idCol > -1) rowTime = ppTimeFromTxId(data[i][idCol]);
    if(rowTime && data[i][0] !== 'Timestamp') {
      var rawQ = String(data[i][qtyCol] || '0').replace(/,/g, '');
      result.push({
        txId: String(data[i][idCol] || ''),
        time: rowTime,
        type: String(data[i][typeCol] || ''),
        ref: String(data[i][refCol] || ''),
        sku: String(data[i][skuCol] || ''),
        name: String(data[i][nameCol] || ''),
        qty: parseFloat(rawQ) || 0,
        fromBranch: fbCol > -1 ? String(data[i][fbCol] || '') : '',
        toBranch: tbCol > -1 ? String(data[i][tbCol] || '') : '',
        user: String(data[i][userCol] || ''),
        photo: urlCol > -1 ? String(data[i][urlCol] || '') : '',
        inCharge: inChargeCol > -1 ? String(data[i][inChargeCol] || '') : ''
      });
    }
  }
  return result;
}
