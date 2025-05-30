# Copyright (c) 2025, royalsmb and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import cint


class LookerStudioReport(Document):
	pass
@frappe.whitelist()
def get_doctype_fields(doctype_name):
	"""Get all fields from a DocType for use in the Looker Studio Report
	
	Args:
		doctype_name (str): Name of the DocType to get fields from
	
	Returns:
		list: List of fields with their properties
	"""
	if not doctype_name:
		return []
	
	try:
		# Get DocType metadata
		meta = frappe.get_meta(doctype_name)
		
		# Get all fields from the DocType
		fields = []
		for field in meta.fields:
			# Skip hidden fields and section/column breaks
			if field.hidden or field.fieldtype in ["Section Break", "Column Break", "Tab Break", "HTML", "Button"]:
				continue
			
			# Build field information
			field_info = {
				"label": field.label or field.fieldname,
				"fieldname": field.fieldname,
				"fieldtype": field.fieldtype,
				"options": field.options,
				"reqd": field.reqd,
				"is_numeric": field.fieldtype in ["Int", "Float", "Currency", "Percent"],
				"is_date": field.fieldtype in ["Date", "Datetime"],
				"is_boolean": field.fieldtype == "Check"
			}
			
			fields.append(field_info)
		
		# Add standard fields that might be useful
		standard_fields = [
			{"label": "Name", "fieldname": "name", "fieldtype": "Data", "is_numeric": False, "is_date": False, "is_boolean": False}
		]
		
		# Add standard fields only if they don't already exist
		for std_field in standard_fields:
			if not any(f["fieldname"] == std_field["fieldname"] for f in fields):
				fields.append(std_field)
		
		return fields
	except Exception as e:
		frappe.log_error(f"Error getting fields for {doctype_name}: {str(e)}", "Looker Studio Report")
		return []
