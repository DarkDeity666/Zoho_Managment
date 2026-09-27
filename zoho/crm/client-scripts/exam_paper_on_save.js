// Exam_Papers > Create Page and Edit Page > onSave.
const exam = ZDK.Page.getField('Exam').getValue();
const subject = ZDK.Page.getField('Subject').getValue();
if (!exam?.id || !subject?.id) {
  ZDK.Client.showAlert('Select an examination and subject.');
  return false;
}
ZDK.Page.getField('Unique_Key').setValue(`${exam.id}-${subject.id}`);
return true;
