const express = require('express');
const { query, param, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const path = require('path');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

router.get('/leads', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['NEW', 'PINGED', 'ACCEPTED', 'REJECTED', 'POSTED']),
  query('search').optional().isString().trim(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }

  const {
    page = 1,
    limit = 25,
    status,
    search,
    startDate,
    endDate
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { phone: { contains: search } },
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { externalLeadId: { contains: search } },
      { ringbaBuyerId: { contains: search } }
    ];
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  try {
    const [leads, totalCount] = await Promise.all([
      prisma.lead.findMany({
        where,
        select: {
          id: true,
          externalLeadId: true,
          phone: true,
          firstName: true,
          lastName: true,
          state: true,
          zip: true,
          insuranceStatus: true,
          status: true,
          ringbaBid: true,
          ringbaBuyerId: true,
          createdAt: true,
          pingedAt: true,
          postedAt: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take
      }),
      prisma.lead.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    res.json({
      leads,
      pagination: {
        page: parseInt(page),
        limit: take,
        totalCount,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    logger.error('Failed to fetch leads', {
      error: error.message,
      filters: { status, search, startDate, endDate }
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch leads'
    });
  }
});

module.exports = router;
