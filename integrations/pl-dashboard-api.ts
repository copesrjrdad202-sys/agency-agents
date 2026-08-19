/**
 * P&L Dashboard API
 * Exposes dashboard metrics as REST endpoints
 * Integration point for frontend dashboard
 */

import express, { Request, Response } from 'express';
import {
  getDashboardMetrics,
  recordInvoice,
  recordPayment,
  recordAppointment,
  exportMetrics,
  health,
} from './pl-dashboard-agent';

const router = express.Router();

/**
 * GET /api/dashboard/:businessId
 * Returns complete P&L dashboard metrics
 */
router.get('/dashboard/:businessId', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const metrics = await getDashboardMetrics(businessId);
    
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard API] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/dashboard/:businessId/summary
 * Returns quick summary (dashboard card style)
 */
router.get('/dashboard/:businessId/summary', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const metrics = await getDashboardMetrics(businessId);
    
    const summary = {
      businessName: metrics.businessName,
      today: {
        revenue: metrics.revenue.today,
        profit: metrics.profit.today,
        invoices: metrics.activity.invoicesGeneratedToday,
        appointments: metrics.activity.appointmentsBookedToday,
      },
      thisMonth: {
        revenue: metrics.revenue.thisMonth,
        profit: metrics.profit.thisMonth,
        margin: metrics.margin.thisMonth,
        invoices: metrics.activity.invoicesGeneratedThisMonth,
        appointments: metrics.activity.appointmentsBookedThisMonth,
      },
      thisYear: {
        revenue: metrics.revenue.thisYear,
        profit: metrics.profit.thisYear,
        taxLiability: metrics.tax.estimatedTaxLiability,
      },
      trend: {
        revenueChangeMonth: metrics.comparison.monthVsLastMonth.revenueChange,
        profitChangeMonth: metrics.comparison.monthVsLastMonth.profitChange,
        revenueChangeYear: metrics.comparison.ytdVsLastYear.revenueChange,
      },
      insights: metrics.insights,
    };

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard API] Summary error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/dashboard/:businessId/revenue
 * Returns revenue breakdown data
 */
router.get('/dashboard/:businessId/revenue', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const metrics = await getDashboardMetrics(businessId);
    
    res.json({
      success: true,
      data: {
        daily: metrics.revenue.today,
        monthly: metrics.revenue.thisMonth,
        yearly: metrics.revenue.thisYear,
        byService: metrics.breakdown.byService.map((s) => ({
          service: s.serviceName,
          revenue: s.revenue,
          count: s.count,
        })),
        byDay: metrics.breakdown.byDay.slice(0, 7), // Last 7 days
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard API] Revenue error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/dashboard/:businessId/profitability
 * Returns profit and margin data
 */
router.get('/dashboard/:businessId/profitability', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const metrics = await getDashboardMetrics(businessId);
    
    res.json({
      success: true,
      data: {
        profit: {
          daily: metrics.profit.today,
          monthly: metrics.profit.thisMonth,
          yearly: metrics.profit.thisYear,
        },
        margin: {
          daily: metrics.margin.today,
          monthly: metrics.margin.thisMonth,
          yearly: metrics.margin.thisYear,
        },
        comparison: {
          monthVsLastMonth: metrics.comparison.monthVsLastMonth,
          yearVsLastYear: metrics.comparison.ytdVsLastYear,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard API] Profitability error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/dashboard/:businessId/tax
 * Returns tax calculations
 */
router.get('/dashboard/:businessId/tax', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const metrics = await getDashboardMetrics(businessId);
    
    res.json({
      success: true,
      data: {
        taxableIncome: metrics.tax.taxableIncomeYTD,
        estimatedLiability: metrics.tax.estimatedTaxLiability,
        effectiveTaxRate: metrics.tax.taxRate,
        period: {
          startDate: metrics.period.ytdStartDate,
          endDate: metrics.period.ytdEndDate,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard API] Tax error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/dashboard/:businessId/record-invoice
 * Record a new invoice (called by Invoice Agent)
 */
router.post('/dashboard/:businessId/record-invoice', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const invoiceData = req.body;
    
    await recordInvoice({
      businessId,
      ...invoiceData,
    });
    
    res.json({
      success: true,
      message: 'Invoice recorded',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard API] Record invoice error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record invoice',
    });
  }
});

/**
 * POST /api/dashboard/:businessId/record-payment
 * Record a payment (called by Payment Agent)
 */
router.post('/dashboard/:businessId/record-payment', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const paymentData = req.body;
    
    await recordPayment({
      businessId,
      ...paymentData,
    });
    
    res.json({
      success: true,
      message: 'Payment recorded',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard API] Record payment error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record payment',
    });
  }
});

/**
 * POST /api/dashboard/:businessId/record-appointment
 * Record an appointment (called by Calendar Agent)
 */
router.post('/dashboard/:businessId/record-appointment', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const appointmentData = req.body;
    
    await recordAppointment({
      businessId,
      ...appointmentData,
    });
    
    res.json({
      success: true,
      message: 'Appointment recorded',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard API] Record appointment error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record appointment',
    });
  }
});

/**
 * GET /api/dashboard/:businessId/export
 * Export metrics in various formats
 */
router.get('/api/dashboard/:businessId/export', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const format = (req.query.format as string) || 'json';
    
    const data = await exportMetrics(businessId, format as 'json' | 'csv');
    
    if (format === 'csv') {
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="dashboard-${businessId}.csv"`);
      res.send(data);
    } else {
      res.json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('[Dashboard API] Export error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /health
 * Health check
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const status = await health();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
