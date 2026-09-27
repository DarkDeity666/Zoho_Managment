// Parent_Links: Create and Edit Page > onSave. Pair with mandatory unique key.
const student = ZDK.Page.getField('Student').getValue();
const email = String(ZDK.Page.getField('Parent_Email').getValue() || '').trim().toLowerCase();
if (!student?.id || !email) { ZDK.Client.showAlert('Select a student and parent email.'); return false; }
ZDK.Page.getField('Parent_Email').setValue(email);
ZDK.Page.getField('Unique_Key').setValue(`${student.id}-${email}`);
return true;

