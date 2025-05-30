# Copyright (c) 2025, royalsmb and contributors
# For license information, please see license.txt

import frappe
import json
from datetime import datetime
from frappe.utils import cint, get_datetime, now, nowdate

@frappe.whitelist()
def get_schema(title=None):
    """
    Get the schema for a Looker Studio report.
    
    This function generates a schema definition that Looker Studio can understand
    based on the fields configured in the Looker Studio Report doctype.
    
    Args:
        title (str): The title of the Looker Studio Report configuration
        
    Returns:
        dict: A dictionary with the schema definition for Looker Studio
    """
    if not title:
        return {"error": "Report title is required"}
    
    try:
        # Get the report configuration
        report = frappe.get_doc("Looker Studio Report", {"title": title})
        
        if not report.published:
            return {"error": "Report is not published"}
        
        # Build the schema
        schema = {
            "schema": []
        }
        
        # Add each field to the schema
        for field in report.export_fields:
            field_type = "STRING"  # Default type
            concept_type = "DIMENSION"  # Default concept
            
            # Parse the field_type which contains both data type and concept type
            if "NUMBER (METRIC)" in field.field_type:
                field_type = "NUMBER"
                concept_type = "METRIC"
            elif "DATE (DIMENSION)" in field.field_type:
                field_type = "DATE"
            elif "BOOLEAN (DIMENSION)" in field.field_type:
                field_type = "BOOLEAN"
            
            # Add the field to the schema
            schema["schema"].append({
                "name": field.id,
                "label": field.fieldname,
                "dataType": field_type,
                "semantics": {
                    "conceptType": concept_type,
                    "semanticType": get_semantic_type(field_type)
                }
            })
        
        return schema
    except Exception as e:
        frappe.log_error(f"Error generating Looker Studio schema: {str(e)}", "Looker Studio Connect")
        return {"error": str(e)}

@frappe.whitelist()
def get_data(title=None, params=None):
    """
    Get data for a Looker Studio report.
    
    This function retrieves data based on the configuration in the Looker Studio Report doctype
    and formats it according to Looker Studio's requirements.
    
    Args:
        title (str): The title of the Looker Studio Report configuration
        params (dict): Additional parameters for filtering data
        
    Returns:
        dict: A dictionary with the data for Looker Studio
    """
    if not title:
        return {"error": "Report title is required"}
    
    try:
        # Parse parameters if provided as string
        if params and isinstance(params, str):
            params = json.loads(params)
        
        # Get the report configuration
        report = frappe.get_doc("Looker Studio Report", {"title": title})
        
        if not report.published:
            return {"error": "Report is not published"}
        
        # Get the data from the reference doctype
        filters = {}
        if params and params.get('filters'):
            filters = params.get('filters')
        
        # Get field names to fetch
        field_names = [field.id for field in report.export_fields]
        
        # Query the database to get the data
        data = frappe.get_all(
            report.reference_doctype,
            fields=field_names,
            filters=filters,
            limit=params.get('limit', 1000) if params else 1000
        )
        
        # Format the data for Looker Studio
        formatted_data = {
            "rows": []
        }
        
        # Process each row
        for row in data:
            formatted_row = {"values": []}
            
            # Process each field in the row
            for field in report.export_fields:
                value = row.get(field.id)
                
                # Format the value based on field type
                if "NUMBER (METRIC)" in field.field_type:
                    # Convert to number
                    value = float(value) if value is not None else 0
                elif "DATE (DIMENSION)" in field.field_type:
                    # Format date for Looker Studio
                    if value:
                        try:
                            date_obj = get_datetime(value)
                            value = date_obj.strftime('%Y%m%d')
                        except:
                            value = None
                elif "BOOLEAN (DIMENSION)" in field.field_type:
                    # Convert to boolean
                    value = bool(cint(value)) if value is not None else False
                
                formatted_row["values"].append(value)
            
            formatted_data["rows"].append(formatted_row)
        
        return formatted_data
    except Exception as e:
        frappe.log_error(f"Error retrieving Looker Studio data: {str(e)}", "Looker Studio Connect")
        return {"error": str(e)}

def get_semantic_type(data_type):
    """
    Get the semantic type for a data type.
    
    Args:
        data_type (str): The data type (STRING, NUMBER, DATE, BOOLEAN)
        
    Returns:
        str: The semantic type for Looker Studio
    """
    semantic_mapping = {
        "STRING": "STRING",
        "NUMBER": "NUMBER",
        "DATE": "YEAR_MONTH_DAY",
        "BOOLEAN": "BOOLEAN"
    }
    
    return semantic_mapping.get(data_type, "STRING")
