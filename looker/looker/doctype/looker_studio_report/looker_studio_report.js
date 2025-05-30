// Copyright (c) 2025, royalsmb and contributors
// For license information, please see license.txt

frappe.ui.form.on("Looker Studio Report", {
	refresh(frm) {
		if (frm.doc.reference_doctype) {
			get_doctype_fields(frm);
		}
	},

	reference_doctype: function(frm) {
		// Clear the export_fields table when doctype changes
		frm.clear_table("export_fields");
		frm.refresh_field("export_fields");
		
		if (frm.doc.reference_doctype) {
			get_doctype_fields(frm);
		}
	}
});

// Function to get doctype fields
function get_doctype_fields(frm) {
	frappe.call({
		method: "looker.looker.doctype.looker_studio_report.looker_studio_report.get_doctype_fields",
		args: {
			doctype_name: frm.doc.reference_doctype
		},
		callback: function(r) {
			if (r.message) {
				// Store the fields data
				frm.doctype_fields = r.message;
				
				// Create array of fieldnames for the dropdown
				let field_options = [];
				r.message.forEach(function(field) {
					field_options.push({
						value: field.fieldname,
						label: field.label + " (" + field.fieldname + ")"
					});
				});
				
				// Update the fieldname options in the child table
				frm.fields_dict.export_fields.grid.update_docfield_property(
					"fieldname",
					"options",
					field_options
				);
				frm.refresh_field("export_fields");
			}
		}
	});
}

// Child table field events
frappe.ui.form.on("Looker Studio Report Field", {
	fieldname: function(frm, cdt, cdn) {
		if (frm.doctype_fields && locals[cdt][cdn].fieldname) {
			let selected_field = frm.doctype_fields.find(f => f.fieldname === locals[cdt][cdn].fieldname);
			if (selected_field) {
				// Set the ID field to the actual fieldname
				frappe.model.set_value(cdt, cdn, 'id', selected_field.fieldname);
				
				// Determine field type and set it
				let field_type = selected_field.is_numeric ? "NUMBER (METRIC)" :
					selected_field.is_date ? "DATE (DIMENSION)" :
					selected_field.is_boolean ? "BOOLEAN (DIMENSION)" :
					"STRING (DIMENSION)";
				
				frappe.model.set_value(cdt, cdn, 'field_type', field_type);
			}
		}
	}
});
