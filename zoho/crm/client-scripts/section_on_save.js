// Sections: Create and Edit Page > onSave. Pair with mandatory unique key.
const year = ZDK.Page.getField('Academic_Year').getValue();
const schoolClass = ZDK.Page.getField('School_Class').getValue();
const name = String(ZDK.Page.getField('Name').getValue() || '').trim().toLowerCase();
if (!year?.id || !schoolClass?.id || !name) { ZDK.Client.showAlert('Select an academic year, class and section name.'); return false; }
ZDK.Page.getField('Unique_Key').setValue(`${year.id}-${schoolClass.id}-${name}`);
return true;

