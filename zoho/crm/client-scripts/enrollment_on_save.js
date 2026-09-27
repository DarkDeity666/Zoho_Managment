// Enrollments: Create and Edit Page > onSave. Pair with mandatory unique key.
const student = ZDK.Page.getField('Student').getValue();
const year = ZDK.Page.getField('Academic_Year').getValue();
if (!student?.id || !year?.id) { ZDK.Client.showAlert('Select a student and academic year.'); return false; }
ZDK.Page.getField('Unique_Key').setValue(`${student.id}-${year.id}`);
return true;

