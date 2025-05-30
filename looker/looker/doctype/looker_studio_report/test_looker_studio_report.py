# Copyright (c) 2025, royalsmb and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase, UnitTestCase


# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


def get_doctype_fields(doctype_name):
	"""Get all fields from a DocType for testing
	
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
			
			# Determine appropriate data type for Looker Studio
			data_type = "STRING"
			if field.fieldtype in ["Int", "Float", "Currency", "Percent"]:
				data_type = "NUMBER"
			elif field.fieldtype in ["Date", "Datetime"]:
				data_type = "DATE"
			elif field.fieldtype == "Check":
				data_type = "BOOLEAN"
			
			# Determine concept type (dimensions are categories, metrics are measures)
			concept_type = "DIMENSION"
			if field.fieldtype in ["Int", "Float", "Currency", "Percent"]:
				concept_type = "METRIC"
			
			# Build field information
			field_info = {
				"label": field.label or field.fieldname,
				"fieldname": field.fieldname,
				"data_type": data_type,
				"concept_type": concept_type
			}
			
			fields.append(field_info)
		
		# Add standard fields that might be useful
		standard_fields = [
			{"label": "Name", "fieldname": "name", "data_type": "STRING", "concept_type": "DIMENSION"}
		]
		
		# Add standard fields only if they don't already exist
		for std_field in standard_fields:
			if not any(f["fieldname"] == std_field["fieldname"] for f in fields):
				fields.append(std_field)
		
		return fields
	except Exception as e:
		frappe.log_error(f"Error getting fields for {doctype_name} in test: {str(e)}", "Looker Studio Report Test")
		return []


class UnitTestLookerStudioReport(UnitTestCase):
	"""
	Unit tests for LookerStudioReport.
	Use this class for testing individual functions and methods.
	"""
	
	def test_get_doctype_fields(self):
		"""Test the get_doctype_fields function"""
		# Test with a standard DocType that should always exist
		fields = get_doctype_fields("DocType")
		
		# Verify we got some fields
		self.assertTrue(len(fields) > 0, "Should return fields for DocType")
		
		# Verify the field structure
		for field in fields:
			self.assertTrue("label" in field, "Field should have a label")
			self.assertTrue("fieldname" in field, "Field should have a fieldname")
			self.assertTrue("data_type" in field, "Field should have a data_type")
			self.assertTrue("concept_type" in field, "Field should have a concept_type")
			
			# Verify data_type is one of the allowed values
			self.assertIn(field["data_type"], ["STRING", "NUMBER", "DATE", "BOOLEAN"], 
				"data_type should be one of the allowed values")
				
			# Verify concept_type is one of the allowed values
			self.assertIn(field["concept_type"], ["DIMENSION", "METRIC"], 
				"concept_type should be one of the allowed values")


class IntegrationTestLookerStudioReport(IntegrationTestCase):
	"""
	Integration tests for LookerStudioReport.
	Use this class for testing interactions between multiple components.
	"""

	def test_doctype_integration(self):
		"""Test that the DocType fields can be retrieved and used in a report"""
		# Create a test report
		report = frappe.new_doc("Looker Studio Report")
		report.title = "Test Report"
		report.reference_doctype = "DocType"
		
		# Get fields
		fields = get_doctype_fields("DocType")
		
		# Add some fields to the report
		if fields:
			for i, field in enumerate(fields[:3]):  # Add first 3 fields
				report.append("export_fields", {
					"label": field["label"],
					"fieldname": field["fieldname"],
					"data_type": field["data_type"],
					"concept_type": field["concept_type"]
				})
		
		# Verify fields were added correctly
		self.assertEqual(len(report.export_fields), min(3, len(fields)), 
			"Report should have the correct number of export fields")
