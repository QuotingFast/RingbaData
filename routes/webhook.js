const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

function validatePhoneNumber(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (digits.startsWith('+')) {
    return phone;
  } else {
    return `+${digits}`;
  }
}

// Updated validation to handle nested JSON structure
const leadValidation = [
  body('contact.phone')
    .notEmpty()
    .withMessage('Phone number is required in contact.phone')
    .custom((value) => {
      // Basic phone validation - more flexible for different formats
      const digits = value.replace(/\D/g, '');
      if (digits.length >= 10) {
        return true;
      }
      throw new Error('Phone number must have at least 10 digits');
    }),
  body('contact.first_name').optional().isString().trim(),
  body('contact.last_name').optional().isString().trim(),
  body('contact.state').optional().isString().trim(),
  body('contact.zip_code').optional().isString().trim(),
  body('contact.email').optional().isEmail(),
  body('meta.lead_id_code').optional().isString().trim()
];

router.post('/lead', leadValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Webhook validation failed', {
      errors: errors.array(),
      body: req.body
    });
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }

  const { contact, meta, data, id, campaign_id, sell_price } = req.body;

  try {
    const formattedPhone = validatePhoneNumber(contact.phone);

    // Extract data from nested structure
    const leadData = {
      externalLeadId: meta?.lead_id_code || null,
      phone: formattedPhone,
      firstName: contact?.first_name || null,
      lastName: contact?.last_name || null,
      email: contact?.email || null,
      city: contact?.city || null,
      state: contact?.state || null,
      zip: contact?.zip_code || null,
      address: contact?.address || null,
      address2: contact?.address2 || null,
      phone2: contact?.phone2 || null,
      ipAddress: contact?.ip_address || null,
      
      // Lead metadata
      janglId: id ? BigInt(id) : null,
      janglUrl: req.body.url || null,
      sellPrice: sell_price ? parseFloat(sell_price) : null,
      campaignId: campaign_id ? BigInt(campaign_id) : null,
      offerId: meta?.offer_id || null,
      sourceId: meta?.source_id || null,
      landingPageUrl: meta?.landing_page_url || null,
      userAgent: meta?.user_agent || null,
      originallyCreated: meta?.originally_created ? new Date(meta.originally_created) : null,
      
      // TCPA and compliance
      trustedFormCertUrl: meta?.trusted_form_cert_url || null,
      tcpaCompliant: meta?.tcpa_compliant || null,
      tcpaConsentText: meta?.tcpa_consent_text || null,
      oneToOne: meta?.one_to_one || null,
      
      // Extract primary driver info
      driverFirstName: data?.drivers?.[0]?.first_name || null,
      driverLastName: data?.drivers?.[0]?.last_name || null,
      driverRelationship: data?.drivers?.[0]?.relationship || null,
      driverGender: data?.drivers?.[0]?.gender || null,
      driverBirthDate: data?.drivers?.[0]?.birth_date ? new Date(data.drivers[0].birth_date) : null,
      driverMaritalStatus: data?.drivers?.[0]?.marital_status || null,
      driverEducation: data?.drivers?.[0]?.education || null,
      driverOccupation: data?.drivers?.[0]?.occupation || null,
      driverAgeLicensed: data?.drivers?.[0]?.age_licensed || null,
      driverLicenseState: data?.drivers?.[0]?.license_state || null,
      driverLicenseStatus: data?.drivers?.[0]?.license_status || null,
      driverLicenseEverSuspended: data?.drivers?.[0]?.license_ever_suspended || null,
      driverRequiresSr22: data?.drivers?.[0]?.requires_sr22 || null,
      driverBankruptcy: data?.drivers?.[0]?.bankruptcy || null,
      driverMonthsAtEmployer: data?.drivers?.[0]?.months_at_employer || null,
      driverMonthsAtResidence: data?.drivers?.[0]?.months_at_residence || null,
      driverResidenceType: data?.drivers?.[0]?.residence_type || null,
      
      // Extract primary vehicle info
      vehicleYear: data?.vehicles?.[0]?.year || null,
      vehicleMake: data?.vehicles?.[0]?.make || null,
      vehicleModel: data?.vehicles?.[0]?.model || null,
      vehicleSubmodel: data?.vehicles?.[0]?.submodel || null,
      vehicleVin: data?.vehicles?.[0]?.vin || null,
      vehicleOwnership: data?.vehicles?.[0]?.ownership || null,
      vehiclePrimaryUse: data?.vehicles?.[0]?.primary_use || null,
      vehicleAnnualMiles: data?.vehicles?.[0]?.annual_miles || null,
      vehicleOneWayDistance: data?.vehicles?.[0]?.one_way_distance || null,
      vehicleWeeklyCommuteDays: data?.vehicles?.[0]?.weekly_commute_days || null,
      vehicleGarage: data?.vehicles?.[0]?.garage || null,
      vehicleFourWheelDrive: data?.vehicles?.[0]?.four_wheel_drive || null,
      vehicleAirbags: data?.vehicles?.[0]?.airbags || null,
      vehicleAbs: data?.vehicles?.[0]?.abs || null,
      vehicleAutomaticSeatBelts: data?.vehicles?.[0]?.automatic_seat_belts || null,
      vehicleAlarm: data?.vehicles?.[0]?.alarm || null,
      vehicleSalvaged: data?.vehicles?.[0]?.salvaged || null,
      vehicleRental: data?.vehicles?.[0]?.rental || null,
      vehicleTowing: data?.vehicles?.[0]?.towing || null,
      vehicleCollisionDeductible: data?.vehicles?.[0]?.collision_deductible || null,
      vehicleComprehensiveDeductible: data?.vehicles?.[0]?.comprehensive_deductible || null,
      
      // Policy information
      requestedCoverageType: data?.requested_policy?.coverage_type || null,
      requestedPropertyDamage: data?.requested_policy?.property_damage || null,
      requestedBodilyInjury: data?.requested_policy?.bodily_injury || null,
      hasCurrentPolicy: data?.current_policy !== null,
      
      // Counts
      totalDrivers: data?.drivers?.length || 1,
      totalVehicles: data?.vehicles?.length || 1,
      totalAccidents: data?.drivers?.reduce((acc, driver) => acc + (driver.accidents?.length || 0), 0) || 0,
      totalTickets: data?.drivers?.reduce((acc, driver) => acc + (driver.tickets?.length || 0), 0) || 0,
      totalViolations: data?.drivers?.reduce((acc, driver) => acc + (driver.major_violations?.length || 0), 0) || 0,
      totalClaims: data?.drivers?.reduce((acc, driver) => acc + (driver.claims?.length || 0), 0) || 0,
      
      // Status and storage
      status: 'NEW',
      insuranceStatus: data?.current_policy ? 'CURRENT' : 'NONE',
      fullPayload: req.body,
      extraData: req.body.extra_data || null,
      leadTimestamp: req.body.timestamp ? new Date(req.body.timestamp) : null
    };

    const lead = await prisma.lead.create({
      data: leadData
    });

    logger.info('Lead created successfully', {
      leadId: lead.id,
      externalLeadId: lead.externalLeadId,
      phone: formattedPhone,
      janglId: id,
      campaignId: campaign_id
    });

    res.status(200).json({
      success: true,
      leadId: lead.id,
      externalLeadId: lead.externalLeadId,
      message: 'Lead received and processed successfully'
    });

  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('phone')) {
      logger.warn('Duplicate phone number', {
        phone: contact.phone,
        error: error.message
      });
      return res.status(409).json({
        error: 'Duplicate Lead',
        message: 'A lead with this phone number already exists'
      });
    }

    logger.error('Failed to create lead', {
      error: error.message,
      body: req.body
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process lead'
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await prisma.lead.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });

    const totalLeads = await prisma.lead.count();
    const todayLeads = await prisma.lead.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    });

    res.json({
      totalLeads,
      todayLeads,
      statusBreakdown: stats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.status;
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('Failed to get webhook stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
