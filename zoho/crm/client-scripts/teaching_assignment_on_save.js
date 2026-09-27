// Teaching_Assignments: Create and Edit Page > onSave. Pair with mandatory unique key.
const section = ZDK.Page.getField('Section').getValue();
const subject = ZDK.Page.getField('Subject').getValue();
if (!section?.id || !subject?.id) { ZDK.Client.showAlert('Select a section and subject.'); return false; }
ZDK.Page.getField('Unique_Key').setValue(`${section.id}-${subject.id}`);
return true;

