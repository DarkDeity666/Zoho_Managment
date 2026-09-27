// Results > Create Page and Edit Page > onSave.
const enrollment = ZDK.Page.getField('Enrollment').getValue();
const paper = ZDK.Page.getField('Exam_Paper').getValue();
if (!enrollment?.id || !paper?.id) {
  ZDK.Client.showAlert('Select a student enrollment and an examination paper.');
  return false;
}
ZDK.Page.getField('Unique_Key').setValue(`${enrollment.id}-${paper.id}`);
return true;
