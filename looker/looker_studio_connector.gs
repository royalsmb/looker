var cc = DataStudioApp.createCommunityConnector();

/**
 * Returns the Auth type. This connector uses KEY authentication type
 * but leverages Frappe's OAuth 2.0 system underneath.
 * @return {object} The auth type.
 */
function getAuthType() {
  var AuthTypes = cc.AuthType;
  return cc
    .newAuthTypeResponse()
    .setAuthType(AuthTypes.KEY)
    .setHelpUrl('https://frappe.io/docs/user/en/guides/integration/how_to_setup_oauth')
    .build();
}

/**
 * Returns true if the auth service has access.
 * @return {boolean}
 */
function isAuthValid() {
  var userProperties = PropertiesService.getUserProperties();
  var siteUrl = userProperties.getProperty('dscc.siteUrl');
  var clientId = userProperties.getProperty('dscc.clientId');
  var clientSecret = userProperties.getProperty('dscc.clientSecret');
  var accessToken = userProperties.getProperty('dscc.accessToken');
  var tokenExpiry = userProperties.getProperty('dscc.tokenExpiry');
  
  // Check if credentials exist
  if (!siteUrl || !clientId || !clientSecret) {
    return false;
  }
  
  // Check if we have a valid token
  if (accessToken && tokenExpiry) {
    var expiryTime = new Date(tokenExpiry).getTime();
    var currentTime = new Date().getTime();
    
    // If token is still valid, return true
    if (currentTime < expiryTime) {
      return true;
    }
  }
  
  // If we have credentials but no valid token, try to get a new token
  try {
    // Request a client credentials token
    var tokenUrl = siteUrl + '/api/method/frappe.integrations.oauth2.get_token';
    
    var response = UrlFetchApp.fetch(tokenUrl, {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: {
        'grant_type': 'client_credentials',
        'client_id': clientId,
        'client_secret': clientSecret,
        'scope': 'all'
      },
      muteHttpExceptions: true
    });
    
    var responseData = JSON.parse(response.getContentText());
    
    // If we got a token, store it and return true
    if (responseData.message && responseData.message.access_token) {
      var token = responseData.message.access_token;
      var expiresIn = responseData.message.expires_in || 3600; // Default to 1 hour
      
      // Calculate expiry time and store token
      var expiryTime = new Date();
      expiryTime.setSeconds(expiryTime.getSeconds() + expiresIn - 300); // 5 minutes buffer
      
      userProperties.setProperty('dscc.accessToken', token);
      userProperties.setProperty('dscc.tokenExpiry', expiryTime.toISOString());
      
      return true;
    }
    
    return false;
  } catch (e) {
    console.error('OAuth token refresh error:', e);
    return false;
  }
}

/**
 * Resets the auth service.
 */
function resetAuth() {
  var userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty('dscc.siteUrl');
  userProperties.deleteProperty('dscc.clientId');
  userProperties.deleteProperty('dscc.clientSecret');
  userProperties.deleteProperty('dscc.accessToken');
  userProperties.deleteProperty('dscc.tokenExpiry');
  userProperties.deleteProperty('dscc.reports');
}

/**
 * Sets the credentials.
 * @param {Request} request The set credentials request.
 * @return {object} The set credentials response.
 */
function setCredentials(request) {
  var userProperties = PropertiesService.getUserProperties();
  
  // Get the site URL from config params
  var siteUrl = request.configParams.siteUrl;
  if (!siteUrl) {
    return {
      errorCode: 'INVALID_CREDENTIALS',
      errorMessage: 'Site URL is required. Please enter it in the connector configuration.'
    };
  }
  
  // Store the OAuth credentials
  userProperties.setProperty('dscc.siteUrl', siteUrl);
  userProperties.setProperty('dscc.clientId', request.key); // Using key field for client_id
  userProperties.setProperty('dscc.clientSecret', request.secret); // Using secret field for client_secret
  
  return {
    errorCode: 'NONE'
  };
}

/**
 * Returns the user configurable options for the connector.
 * @param {object} request Config request parameters.
 * @return {object} Connector configuration to be displayed to the user.
 */
function getConfig(request) {
  var config = cc.getConfig();
  var userProperties = PropertiesService.getUserProperties();
  var isAuthenticated = isAuthValid();
  
  // First page - Site URL input
  if (!request.configParams || !request.configParams.siteUrl) {
    config.newInfo()
      .setId('instructions')
      .setText('Enter your Frappe site URL. You will be prompted for OAuth credentials after this step.');
    
    config.newTextInput()
      .setId('siteUrl')
      .setName('Frappe Site URL')
      .setHelpText('Enter your Frappe site URL (e.g. https://example.erpera.io)')
      .setPlaceholder('https://example.erpera.io')
      .setRequired(true);
    
    return config.build();
  }
  
  // Second page - Report selection (only shown after authentication)
  if (isAuthenticated) {
    config.newInfo()
      .setId('authenticated')
      .setText('You are successfully authenticated! Please select a Looker Studio Report.');
    
    // Get available reports
    try {
      var siteUrl = userProperties.getProperty('dscc.siteUrl');
      var accessToken = userProperties.getProperty('dscc.accessToken');
      
      // Fetch available reports
      var reportsUrl = siteUrl + '/api/method/frappe.client.get_list';
      var response = UrlFetchApp.fetch(reportsUrl, {
        method: 'post',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({
          doctype: 'Looker Studio Report',
          fields: ['name', 'title', 'published'],
          filters: {published: 1}
        }),
        muteHttpExceptions: true
      });
      
      var responseData = JSON.parse(response.getContentText());
      var reports = [];
      
      if (responseData.message && Array.isArray(responseData.message)) {
        reports = responseData.message;
      }
      
      // Store reports in user properties for later use
      userProperties.setProperty('dscc.reports', JSON.stringify(reports));
      
      // Create a dropdown for report selection
      if (reports.length > 0) {
        var reportOptions = {};
        reports.forEach(function(report) {
          reportOptions[report.name] = report.title || report.name;
        });
        
        config.newSelectSingle()
          .setId('reportName')
          .setName('Select Report')
          .setHelpText('Choose a Looker Studio Report to connect to')
          .setAllowOverride(true)
          .setOptions(reportOptions);
      } else {
        config.newInfo()
          .setId('noReports')
          .setText('No published Looker Studio Reports found. Please create and publish a report in your Frappe system.');
      }
    } catch (e) {
      config.newInfo()
        .setId('error')
        .setText('Error fetching reports: ' + e.toString());
    }
  } else {
    config.newInfo()
      .setId('authInstructions')
      .setText('Please authenticate with your Frappe OAuth credentials. Enter your Client ID as Key and Client Secret as Secret in the authentication dialog. You can create OAuth credentials in Frappe under Setup > Integrations > OAuth Client.');
  }
  
  return config.build();
}

/**
 * Defines the fields for the connector.
 * @param {Object} request The request.
 * @return {Object} Fields object.
 */
function getFields(request) {
  var fields = cc.getFields();
  var types = cc.FieldType;
  var userProperties = PropertiesService.getUserProperties();
  
  // Call the Frappe API to get schema
  try {
    // Get stored credentials and configuration
    var siteUrl = userProperties.getProperty('dscc.siteUrl');
    var accessToken = userProperties.getProperty('dscc.accessToken');
    var reportName = request.configParams.reportName;
    
    // Check if we have all required information
    if (!siteUrl || !accessToken || !reportName) {
      // If we don't have the configuration yet (like during initial setup),
      // just return empty fields
      return fields;
    }
    
    // Ensure we have a valid token before proceeding
    if (!isAuthValid()) {
      console.error('Authentication is not valid');
      fields.newDimension()
        .setId('auth_error')
        .setName('Authentication Error')
        .setType(types.TEXT);
      return fields;
    }
    
    // Build the API URL for schema
    var apiUrl = siteUrl + '/api/method/looker.looker.connect.get_schema';
    
    // Make the API request
    var response = UrlFetchApp.fetch(apiUrl, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        title: reportName
      }),
      muteHttpExceptions: true
    });
    
    var responseData = JSON.parse(response.getContentText());
    var schemaData;
    
    // Handle Frappe's response format which might be nested in a 'message' property
    if (responseData.message && responseData.message.schema) {
      schemaData = responseData.message.schema;
    } else if (responseData.schema) {
      schemaData = responseData.schema;
    }
    
    if (schemaData) {
      // Build fields based on schema
      schemaData.forEach(function(field) {
        // Map Looker Studio data types to Data Studio field types
        if (field.dataType === 'NUMBER') {
          fields.newMetric()
            .setId(field.name)
            .setName(field.label || field.name)
            .setType(types.NUMBER);
        } else if (field.dataType === 'DATE') {
          fields.newDimension()
            .setId(field.name)
            .setName(field.label || field.name)
            .setType(types.YEAR_MONTH_DAY);
        } else if (field.dataType === 'BOOLEAN') {
          fields.newDimension()
            .setId(field.name)
            .setName(field.label || field.name)
            .setType(types.BOOLEAN);
        } else {
          // Default to TEXT for string fields
          fields.newDimension()
            .setId(field.name)
            .setName(field.label || field.name)
            .setType(types.TEXT);
        }
      });
    } else {
      // Handle case where schema is empty or missing
      console.error('No schema data received:', responseData);
      fields.newDimension()
        .setId('schema_error')
        .setName('Schema Error')
        .setType(types.TEXT);
    }
  } catch (e) {
    console.error('Error fetching fields:', e);
    // If there's an error, return minimal fields for troubleshooting
    fields.newDimension()
      .setId('error')
      .setName('Error')
      .setType(types.TEXT);
  }
  
  return fields;
}

/**
 * Returns the schema for the given request.
 * @param {Object} request Schema request parameters.
 * @return {Object} Schema for the given request.
 */
function getSchema(request) {
  var fields = getFields(request).build();
  return { schema: fields };
}

/**
 * Returns the tabular data for the given request.
 * @param {Object} request Data request parameters.
 * @return {Object} Tabular data for the given request.
 */
function getData(request) {
  var userProperties = PropertiesService.getUserProperties();
  
  try {
    // Get stored credentials and configuration
    var siteUrl = userProperties.getProperty('dscc.siteUrl');
    var accessToken = userProperties.getProperty('dscc.accessToken');
    var reportName = request.configParams.reportName;
    
    // Check if we have the necessary credentials and configuration
    if (!siteUrl || !accessToken || !reportName) {
      return {
        schema: request.fields,
        rows: [],
        errorMessage: "Missing configuration or credentials"
      };
    }
    
    // Ensure we have a valid token before proceeding
    if (!isAuthValid()) {
      return {
        schema: request.fields,
        rows: [],
        errorMessage: "Authentication token is invalid or expired"
      };
    }
    
    // Build the API URL for data
    var apiUrl = siteUrl + '/api/method/looker.looker.connect.get_data';
    
    // Prepare filter parameters
    var params = {
      filters: {}
    };
    
    // Add date range filters if specified
    if (request.dateRange) {
      params.filters.date_range = {
        startDate: request.dateRange.startDate,
        endDate: request.dateRange.endDate
      };
    }
    
    // Add any requested fields
    var requestedFieldIds = request.fields.map(function(field) {
      return field.name;
    });
    
    // Make the API request
    var response = UrlFetchApp.fetch(apiUrl, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        title: reportName,
        params: params,
        fields: requestedFieldIds
      }),
      muteHttpExceptions: true
    });
    
    var responseData = JSON.parse(response.getContentText());
    var rows = [];
    
    // Handle Frappe's response format
    if (responseData.message && responseData.message.rows) {
      rows = responseData.message.rows;
    } else if (responseData.rows) {
      rows = responseData.rows;
    }
    
    // For empty results, provide an empty rows array
    if (!rows || !Array.isArray(rows)) {
      rows = [];
    }
    
    return {
      schema: request.fields,
      rows: rows
    };
  } catch (e) {
    console.error('Error fetching data:', e);
    return {
      schema: request.fields,
      rows: [],
      errorMessage: "Error fetching data: " + e.toString()
    };
  }
}
