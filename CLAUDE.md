# Paper Plane - Global Logistics (ระบบจัดการสต็อก)

ระบบนี้ใช้งานจริงอยู่ ผู้ใช้สื่อสารเป็นภาษาไทย ให้ตอบเป็นภาษาไทย

## กฎการทำงาน (เจ้าของระบบกำหนดไว้ ต้องทำตามเคร่งครัด)

- แก้เฉพาะข้อที่ผู้ใช้แจ้งเท่านั้น ห้าม refactor หรือแตะส่วนอื่นที่ทำงานดีอยู่แล้ว
- ถ้าข้อที่แจ้งทำให้ต้องแก้ส่วนอื่นที่เกี่ยวข้อง แก้ได้ แต่ต้องบอกให้ครบว่ามีอะไรเปลี่ยนไปบ้าง
- ตรวจสอบและทดสอบหา bug ก่อนส่งงานทุกครั้ง
- ส่งโค้ดเป็นฟังก์ชันหรือไฟล์ฉบับเต็ม ไม่ตัด ไม่ย่อ และไม่ใส่คอมเมนต์อธิบายในโค้ด
- ถ้าแก้เพียงบางส่วนของไฟล์ ส่งเฉพาะส่วนนั้น (ฉบับเต็มของส่วนนั้น) ได้ ถ้าไม่ใช่ให้ส่งทั้งไฟล์
- อธิบายขั้นตอนที่ผู้ใช้ต้องทำเองทุกครั้ง (เช่น Deploy, การตั้งค่าในชีต) และสอนขั้นตอน Deploy ให้ทำตามได้เอง
- ขออนุญาตก่อนเข้าถึงข้อมูลสำคัญ เช่น แท็บ `Users` ในชีต
- ห้ามทดสอบการบันทึก/ลบ/แก้ไขรายการกับระบบจริง ให้ทดสอบกับข้อมูลจำลองเท่านั้น
- การ Deploy `Code.gs` และการอัปเดต GitHub ต้องได้รับคำสั่งจากผู้ใช้ในรอบนั้นก่อนทุกครั้ง

## โครงสร้างระบบ

| ส่วน | ที่อยู่ |
|---|---|
| Frontend | `index.html` ไฟล์เดียว (HTML + Vanilla JS + Tailwind CDN + SweetAlert2) เผยแพร่ผ่าน GitHub Pages จาก repo `waranchit-source/paper-plane-stock` branch `main` |
| Backend | `Code.gs` ใน Apps Script ที่ผูกกับ Google Sheet "Stock System" ทำงานเป็น Web App (`doGet` / `doPost`) |
| ฐานข้อมูล | Google Sheet แท็บ `Master data`, `Inventory_Transaction`, `Stock_Balance`, `PO Management`, `Branches`, `In charge`, `Users` |
| รูปภาพ | Google Drive โฟลเดอร์ `PaperPlane_Receipts` |

ไฟล์ในโฟลเดอร์นี้คือสำเนาสำหรับแก้ไข `Code.gs` ต้องตรงกับที่อยู่ใน Apps Script และ `index.html` ต้องตรงกับที่อยู่บน GitHub โฟลเดอร์ `backup/` เก็บฉบับก่อนแก้

หน้าเว็บเรียก backend ผ่านตัวแปร `SCRIPT_URL` ใน `index.html` (ชี้ไปที่ URL `/exec` ของ Apps Script Web App) ห้ามเปลี่ยน URL นี้ การ Deploy ต้องเป็นการออกเวอร์ชันใหม่บน deployment เดิม

ตั้งแต่ 2026-10-02 (PR #1 merge แล้ว) repo `waranchit-source/paper-plane-stock` เก็บโค้ด backend ไว้เป็นไฟล์ `Code.gs` ด้วย ทุกครั้งที่แก้โค้ดใน Apps Script ต้องแก้ `Code.gs` บน GitHub ให้ตรงกันเสมอ

ไฟล์ `CLAUDE.md` นี้เก็บไว้สองที่ คือในโฟลเดอร์นี้และใน repo บน GitHub เมื่อแก้ที่หนึ่งต้องแก้อีกที่ให้ตรงกัน

### คอลัมน์แท็บ `Inventory_Transaction`

| A | B | C | D | E | F | G | H | I | J | K | L | M | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Transaction_ID | Type | Ref_No | SKU | Item_Name | Qty | From_Branch | To_Branch | User | Invoice | Remark | Photo_URL | In_Charge |

### หมายเหตุชีต

- แท็บ `Master data` และ `PO Management` ดึงข้อมูลด้วย `IMPORTRANGE` จากไฟล์อื่น การอ่านจึงช้า น่าจะเป็นสาเหตุที่บางครั้งขึ้น "Refresh failed (timeout)"

## กลไกป้องกันข้อมูลที่ต้องรักษาไว้

**Backend (`Code.gs`)**
- `processBulkTransaction`, `deleteTransactions`, `editTransaction` ต้องถือ `LockService` script lock ตลอดช่วงที่เขียนข้อมูล
- การบันทึกเป็นแบบทั้งชุดหรือไม่มีเลย: เขียนแถวรายการด้วย `setValues` ครั้งเดียว แล้วเรียก `applyStockAdjustments` ถ้าล้มเหลวต้องลบแถวที่เพิ่งเขียน (`rollbackTransactionRows`) และคืนยอดสต็อก
- สต็อกปรับแบบ Delta เท่านั้นผ่าน `applyStockAdjustments` ห้ามคำนวณยอดใหม่ทั้งตาราง
- รหัสประจำการส่ง (`requestId`): `processBulkTransaction` ตรวจสถานะ `DONE` / `CANCELLED` ก่อนเขียน และ `resolveSubmission` ใช้ยืนยันผลหรือยกเลิกคำขอที่ผลไม่ชัดเจน สองฟังก์ชันนี้ต้องทำงานคู่กันภายใต้ lock
- รูปอัปโหลดแยกผ่าน `uploadPhoto` ก่อนบันทึกรายการ แต่ `processBulkTransaction` ยังต้องรับ `photoBase64` ในรายการได้ เพื่อรองรับหน้าเว็บรุ่นเก่า
- ทุกครั้งที่เขียนข้อมูลสำเร็จต้องเรียก `invalidateLiveCache()`
- `getInitData`, `getSystemData`, `getStockData`, `getRecentTransactions` ต้องคงรูปแบบผลลัพธ์เดิมไว้ เพราะหน้าเว็บรุ่นเก่าที่เปิดค้างอยู่ยังเรียกใช้
- `onSheetChangeTrigger` ทำงานเมื่อมีคนแก้ช่องจำนวนในชีตโดยตรง และเรียก `applyStockAdjustments` เช่นกัน

**Frontend (`index.html`)**
- การส่งรายการทั้งสามหน้า (PO, Scan & Action, Stock Count) ต้องผ่าน `safeSubmitTransaction` เท่านั้น
- ขึ้น Success เมื่อเซิร์ฟเวอร์ยืนยันว่าบันทึกแล้วเท่านั้น และขึ้นว่าไม่สำเร็จเมื่อยืนยันได้ว่าไม่มีอะไรถูกบันทึก ถ้ายืนยันไม่ได้ต้องเก็บ `pp_pending_submit` ไว้และคงรายการบนจอ
- ร่างรายการ: ข้อมูลอยู่ใน `localStorage` (`pp_draft_action`, `pp_draft_count`) ส่วนรูปอยู่ใน IndexedDB (`pp_store`)
- ซิงก์เบื้องหลังทุก 10 วินาทีผ่าน `getSyncData` พร้อมเลขเวอร์ชัน (`sv`, `lv`) และต้องหยุดเมื่อ `isSubmitting` เป็นจริง
- สิทธิ์ผู้ใช้ (Admin / Manager / User) และการกรองสาขาตามสิทธิ์ ตรวจที่หน้าเว็บ ห้ามทำให้หลวมลง
- ข้อความที่มาจากข้อมูลในชีตต้องผ่าน `escHtml` ก่อนแทรกลง HTML
- ตารางใช้ class `resp-wrap` / `resp-table` เพื่อเปลี่ยนเป็นการ์ดเมื่อพื้นที่แคบ ตารางใหม่ต้องใช้รูปแบบเดียวกัน
- ถ้าเพิ่มไอคอน Material Symbols ตัวใหม่ ต้องเพิ่มชื่อไอคอนในพารามิเตอร์ `icon_names` ของลิงก์ฟอนต์ใน `<head>` (เรียงตามตัวอักษร) ไม่อย่างนั้นไอคอนจะแสดงเป็นข้อความ

## แคชฝั่งเซิร์ฟเวอร์

`getCachedPart` เก็บข้อมูลสองกลุ่มใน `CacheService`
- `PP_STATIC` (สาขา, ผู้รับผิดชอบ, สินค้า) สดใหม่ 120 วินาที
- `PP_LIVE` (PO, ยอดรับ PO, สต็อก, ประวัติ) สดใหม่ 20 วินาที และถูกล้างทันทีเมื่อมีการเขียนผ่านเว็บแอป

ข้อมูลที่แก้ในชีตโดยตรงจึงขึ้นในแอปช้ากว่าเล็กน้อย ปุ่ม Refresh ส่ง `force=1` เพื่ออ่านชีตใหม่ทันที

## การทดสอบ

- ทดสอบ `Code.gs` ด้วย Node โดยจำลอง `SpreadsheetApp`, `CacheService`, `LockService`, `PropertiesService`, `DriveApp` ในหน่วยความจำ แล้วเปิด `index.html` ผ่านเซิร์ฟเวอร์ในเครื่องที่เปลี่ยน `SCRIPT_URL` ไปชี้ตัวจำลอง
- กรณีที่ต้องทดสอบทุกครั้งเมื่อแตะการบันทึก: ส่งซ้ำด้วย `requestId` เดิม, ตัดสต็อกล้มกลางทาง, เซิร์ฟเวอร์บันทึกแล้วแต่คำตอบไม่ถึงหน้าเว็บ, คำขอไม่ถึงเซิร์ฟเวอร์, lock ไม่ว่าง, อัปโหลดรูปไม่สำเร็จ
- ตรวจระบบจริงได้เฉพาะคำขอแบบอ่านอย่างเดียว เช่น `?action=healthCheck` และ `?action=getSyncData`
- ตรวจหน้าจอที่ความกว้าง 360, 768, 1024, 1366 พิกเซล ต้องไม่มีการเลื่อนซ้ายขวา

## การนำขึ้นใช้งาน

1. `Code.gs`: วางโค้ดใน Apps Script แล้วบันทึก จากนั้น Deploy > Manage deployments > เลือก deployment ที่ใช้งานอยู่ > แก้ไข > Version: New version > ใส่ Description (ผู้ใช้ตั้งชื่อเรียงเป็น A1, A2, ... ช่องนี้ถูกล้างทุกครั้งที่เลือกเวอร์ชันใหม่) > Deploy (ปุ่มแก้ไขคือไอคอนดินสอ) ห้ามใช้ "New deployment" เด็ดขาด เพราะจะได้ URL ใหม่ และ `index.html` จะเรียก backend ไม่ได้
2. Deploy `Code.gs` ก่อน แล้วจึงอัปเดต `index.html` บน GitHub เสมอ เพราะ backend รองรับหน้าเว็บรุ่นเก่า แต่หน้าเว็บรุ่นใหม่ต้องการ backend รุ่นใหม่
3. หลัง Deploy ตรวจ `?action=healthCheck` ว่าได้ `ok`, `cache`, `lock`, `props` เป็น `true` ครบ
4. ย้อนกลับ: เลือกเวอร์ชันก่อนหน้าใน Manage deployments และนำ `index.html` ฉบับก่อนหน้ากลับขึ้น GitHub
5. หลังแก้ Apps Script ทุกครั้ง อัปเดต `Code.gs` ใน repo GitHub ให้ตรงกัน

## บันทึกการแก้ไข

### 2026-10-02: Timestamp ว่างใน Outbound หลายบรรทัด

- ปัญหา: รายการ Outbound หลายบรรทัด (`TXN20261002164256_370`) ถูกบันทึกโดยช่อง Timestamp ว่าง และ Activity Log ข้ามรายการนี้ไป
- `Code.gs`: เพิ่ม `ppIsSaneDate`, `ppApplyTxDate`, `ppTimeFromTxId`
  - `processBulkTransaction` และ `editTransaction` รับวันที่รายการเฉพาะปี 2000-2100 ถ้าไม่ใช่ให้ใช้เวลาปัจจุบัน
  - `buildRecentTransactions` ถ้าช่อง Timestamp ว่าง ให้หาเวลาจาก `Transaction_ID`
- `index.html`: เพิ่ม `isValidTxDate` และ `invalidTxDateAlert` ใช้ตรวจก่อนส่งในหน้า PO receive, Scan & Action และ Stock Count
  - `apiRequest` ใช้ timeout 90 วินาทีทั้ง GET และ POST
