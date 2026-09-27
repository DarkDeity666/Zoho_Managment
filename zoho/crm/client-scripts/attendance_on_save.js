// CRM Client Script: Attendance > Create Page and Edit Page > Page Event > onSave.
// Enable for every staff layout. Unique_Key must also be marked unique in CRM.
const enrollment = ZDK.Page.getField('Enrollment').getValue();
const day = ZDK.Page.getField('Attendance_Date').getValue();
if (!enrollment?.id || !day) {
  ZDK.Client.showAlert('Select an enrollment and date.');
  return false;
}
// Configure the CRM organization date format as yyyy-MM-dd (see deployment guide).
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  ZDK.Client.showAlert('Set the CRM date format to yyyy-MM-dd before recording attendance.');
  return false;
}
ZDK.Page.getField('Unique_Key').setValue(`${enrollment.id}-${day}`);
return true;
