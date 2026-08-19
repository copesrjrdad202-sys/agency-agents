/**
 * P&L Dashboard Agent
 * 
 * Calculates and exposes business profitability metrics:
 * - Daily revenue
 * - YTD revenue
 * - YTD profit
 * - Profit margin %
 * - YoY comparison
 * - # of invoices generated
 * - # of payments received
 * - Tax liability
 */

import { businessContextAgent } from './business-context-agent';

interface DashboardMetrics {
  businessId: string;
  businessName: string;
  period: {
    date: string;
    year: number;
    month: number;
    ytdStartDate: string;
    ytdEndDate: string;
  };
  revenue: {
    today: number;
    thisMonth: number;
    thisYear: number;
    lastMonthSame: number;
    lastYearSame: number;
  };
  profit: {
    today: number;
    thisMonth: number;
    thisYear: number;
    lastMonthSame: number;
    lastYearSame: number;
  };
  margin: {
    today: number; // %
    thisMonth: number; // %
    thisYear: number; // %
    lastMonthSame: number; // %
    lastYearSame: number; // %
  };
  activity: {
    invoicesGeneratedToday: number;
    invoicesGeneratedThisMonth: number;
    paymentsReceivedToday: number;
    paymentsReceivedThisMonth: number;
    appointmentsBookedToday: number;
    appointmentsBookedThisMonth: number;
  };
  tax: {
    taxableIncomeYTD: number;
    estimatedTaxLiability: number;
    taxRate: number; // %
  };
  breakdown: {
    byService: Array<{
      serviceName: string;
      count: number;
      revenue: number;
      profit: number;
      margin: number;
    }>;
    byDay: Array<{
      date: string;
      revenue: number;
      profit: number;
      invoicesCount: number;
      paymentsCount: number;
    }>;
  };
  comparison: {
    ytdVsLastYear: {
      revenueChange: number; // %
      profitChange: number; // %
      invoiceCountChange: number; // %
    };
    monthVsLastMonth: {
      revenueChange: number; // %
      profitChange: number; // %
    };
  };
  insights: string[]; // AI-generated business insights
}

// In-memory storage (replace with DynamoDB in production)
const invoiceStore: Map<string, any> = new Map();
const paymentStore: Map<string, any> = new Map();
const appointmentStore: Map<string, any> = new Map();

/**
 * Register invoice when created (called by Invoice Agent)
 */
export async function recordInvoice(invoiceData: {
  businessId: string;
  invoiceId: string;
  amount: number;
  taxAmount: number;
  services: Array<{ name: string; quantity: number; unitPrice: number }>;
  createdAt: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
}): Promise<void> {
  const key = `${invoiceData.businessId}:${invoiceData.invoiceId}`;
  invoiceStore.set(key, {
    ...invoiceData,
    updatedAt: new Date().toISOString(),
  });
  console.log(`[P&L Dashboard] Invoice recorded: ${key}`);
}

/**
 * Register payment when received (called by Payment Agent)
 */
export async function recordPayment(paymentData: {
  businessId: string;
  invoiceId: string;
  amount: number;
  method: string; // 'stripe', 'check', 'cash', etc
  receivedAt: string;
  referenceId: string;
}): Promise<void> {
  const key = `${paymentData.businessId}:${paymentData.invoiceId}`;
  paymentStore.set(key, {
    ...paymentData,
    processedAt: new Date().toISOString(),
  });
  
  // Update invoice status to paid
  const invoiceKey = Array.from(invoiceStore.keys()).find(
    (k) => k.endsWith(paymentData.invoiceId) && k.startsWith(paymentData.businessId)
  );
  if (invoiceKey) {
    const invoice = invoiceStore.get(invoiceKey);
    invoice.status = 'paid';
    invoice.paidAt = paymentData.receivedAt;
    invoiceStore.set(invoiceKey, invoice);
  }
  
  console.log(`[P&L Dashboard] Payment recorded: ${key}`);
}

/**
 * Register appointment when booked (called by Calendar Agent)
 */
export async function recordAppointment(appointmentData: {
  businessId: string;
  appointmentId: string;
  serviceType: string;
  scheduledFor: string;
  createdAt: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}): Promise<void> {
  const key = `${appointmentData.businessId}:${appointmentData.appointmentId}`;
  appointmentStore.set(key, {
    ...appointmentData,
    updatedAt: new Date().toISOString(),
  });
  console.log(`[P&L Dashboard] Appointment recorded: ${key}`);
}

/**
 * Get dashboard metrics for a business
 */
export async function getDashboardMetrics(businessId: string): Promise<DashboardMetrics> {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const ytdStartDate = `${year}-01-01`;
  const ytdEndDate = today.toISOString().split('T')[0];

  // Get business context
  const business = await businessContextAgent.getBusinessProfile(businessId);

  // Filter invoices and payments for this business
  const businessInvoices = Array.from(invoiceStore.values()).filter(
    (inv) => inv.businessId === businessId
  );
  const businessPayments = Array.from(paymentStore.values()).filter(
    (pay) => pay.businessId === businessId
  );
  const businessAppointments = Array.from(appointmentStore.values()).filter(
    (apt) => apt.businessId === businessId
  );

  // Helper functions
  const isToday = (dateStr: string) => dateStr.startsWith(ytdEndDate);
  const isThisMonth = (dateStr: string) => dateStr.startsWith(`${year}-${String(month).padStart(2, '0')}`);
  const isThisYear = (dateStr: string) => dateStr.startsWith(`${year}`);
  const isLastYear = (dateStr: string) => dateStr.startsWith(`${year - 1}`);
  const isLastMonth = (dateStr: string) => {
    const lastMonth = month === 1 ? 12 : month - 1;
    const lastYear = month === 1 ? year - 1 : year;
    return dateStr.startsWith(`${lastYear}-${String(lastMonth).padStart(2, '0')}`);
  };

  // Calculate revenue
  const invoicesToday = businessInvoices.filter(
    (inv) => isToday(inv.createdAt) && inv.status !== 'cancelled'
  );
  const invoicesThisMonth = businessInvoices.filter(
    (inv) => isThisMonth(inv.createdAt) && inv.status !== 'cancelled'
  );
  const invoicesThisYear = businessInvoices.filter(
    (inv) => isThisYear(inv.createdAt) && inv.status !== 'cancelled'
  );
  const invoicesLastMonth = businessInvoices.filter(
    (inv) => isLastMonth(inv.createdAt) && inv.status !== 'cancelled'
  );
  const invoicesLastYear = businessInvoices.filter(
    (inv) => isLastYear(inv.createdAt) && inv.status !== 'cancelled'
  );

  const sumInvoices = (invoices: any[]) =>
    invoices.reduce((sum, inv) => sum + inv.amount, 0);

  const revenueToday = sumInvoices(invoicesToday);
  const revenueThisMonth = sumInvoices(invoicesThisMonth);
  const revenueThisYear = sumInvoices(invoicesThisYear);
  const revenueLastMonth = sumInvoices(invoicesLastMonth);
  const revenueLastYear = sumInvoices(invoicesLastYear);

  // Calculate profit (revenue - business costs)
  // Assuming 30% cost of goods/services (typical for service businesses)
  const costPercentage = 0.30;
  const profitToday = revenueToday * (1 - costPercentage);
  const profitThisMonth = revenueThisMonth * (1 - costPercentage);
  const profitThisYear = revenueThisYear * (1 - costPercentage);
  const profitLastMonth = revenueLastMonth * (1 - costPercentage);
  const profitLastYear = revenueLastYear * (1 - costPercentage);

  // Calculate margins
  const marginToday = revenueToday > 0 ? (profitToday / revenueToday) * 100 : 0;
  const marginThisMonth = revenueThisMonth > 0 ? (profitThisMonth / revenueThisMonth) * 100 : 0;
  const marginThisYear = revenueThisYear > 0 ? (profitThisYear / revenueThisYear) * 100 : 0;
  const marginLastMonth = revenueLastMonth > 0 ? (profitLastMonth / revenueLastMonth) * 100 : 0;
  const marginLastYear = revenueLastYear > 0 ? (profitLastYear / revenueLastYear) * 100 : 0;

  // Calculate payments
  const paymentsToday = businessPayments.filter((pay) => isToday(pay.receivedAt));
  const paymentsThisMonth = businessPayments.filter((pay) => isThisMonth(pay.receivedAt));

  // Appointments
  const appointmentsToday = businessAppointments.filter((apt) => isToday(apt.createdAt));
  const appointmentsThisMonth = businessAppointments.filter((apt) => isThisMonth(apt.createdAt));

  // Tax calculations (assume 25% effective tax rate for service businesses)
  const taxRate = 25;
  const taxableIncomeYTD = profitThisYear;
  const estimatedTaxLiability = (taxableIncomeYTD * taxRate) / 100;

  // Breakdown by service
  const serviceBreakdown = new Map<string, { count: number; revenue: number; profit: number }>();
  invoicesThisMonth.forEach((inv) => {
    inv.services?.forEach((svc: any) => {
      const key = svc.name;
      const current = serviceBreakdown.get(key) || { count: 0, revenue: 0, profit: 0 };
      current.count += svc.quantity || 1;
      current.revenue += svc.unitPrice * (svc.quantity || 1);
      current.profit = current.revenue * (1 - costPercentage);
      serviceBreakdown.set(key, current);
    });
  });

  const breakdownByService = Array.from(serviceBreakdown.entries()).map(([name, data]) => ({
    serviceName: name,
    count: data.count,
    revenue: data.revenue,
    profit: data.profit,
    margin: (data.profit / data.revenue) * 100,
  }));

  // Breakdown by day (last 30 days)
  const breakdownByDay: Array<{
    date: string;
    revenue: number;
    profit: number;
    invoicesCount: number;
    paymentsCount: number;
  }> = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayInvoices = businessInvoices.filter(
      (inv) => inv.createdAt.startsWith(dateStr) && inv.status !== 'cancelled'
    );
    const dayPayments = businessPayments.filter((pay) => pay.receivedAt.startsWith(dateStr));

    if (dayInvoices.length > 0 || dayPayments.length > 0) {
      const dayRevenue = sumInvoices(dayInvoices);
      breakdownByDay.push({
        date: dateStr,
        revenue: dayRevenue,
        profit: dayRevenue * (1 - costPercentage),
        invoicesCount: dayInvoices.length,
        paymentsCount: dayPayments.length,
      });
    }
  }

  // Comparisons
  const revenueChangeYoY = revenueLastYear > 0 
    ? ((revenueThisYear - revenueLastYear) / revenueLastYear) * 100 
    : 0;
  const profitChangeYoY = profitLastYear > 0 
    ? ((profitThisYear - profitLastYear) / profitLastYear) * 100 
    : 0;
  const invoiceCountChangeYoY = invoicesLastYear.length > 0
    ? ((invoicesThisYear.length - invoicesLastYear.length) / invoicesLastYear.length) * 100
    : 0;

  const revenueChangeMonth = revenueLastMonth > 0
    ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
    : 0;
  const profitChangeMonth = profitLastMonth > 0
    ? ((profitThisMonth - profitLastMonth) / profitLastMonth) * 100
    : 0;

  // Generate insights
  const insights = generateInsights(
    revenueThisMonth,
    profitThisMonth,
    marginThisMonth,
    invoicesThisMonth.length,
    revenueChangeMonth,
    profitChangeMonth
  );

  return {
    businessId,
    businessName: business.name,
    period: {
      date: ytdEndDate,
      year,
      month,
      ytdStartDate,
      ytdEndDate,
    },
    revenue: {
      today: revenueToday,
      thisMonth: revenueThisMonth,
      thisYear: revenueThisYear,
      lastMonthSame: revenueLastMonth,
      lastYearSame: revenueLastYear,
    },
    profit: {
      today: profitToday,
      thisMonth: profitThisMonth,
      thisYear: profitThisYear,
      lastMonthSame: profitLastMonth,
      lastYearSame: profitLastYear,
    },
    margin: {
      today: marginToday,
      thisMonth: marginThisMonth,
      thisYear: marginThisYear,
      lastMonthSame: marginLastMonth,
      lastYearSame: marginLastYear,
    },
    activity: {
      invoicesGeneratedToday: invoicesToday.length,
      invoicesGeneratedThisMonth: invoicesThisMonth.length,
      paymentsReceivedToday: paymentsToday.length,
      paymentsReceivedThisMonth: paymentsThisMonth.length,
      appointmentsBookedToday: appointmentsToday.length,
      appointmentsBookedThisMonth: appointmentsThisMonth.length,
    },
    tax: {
      taxableIncomeYTD,
      estimatedTaxLiability,
      taxRate,
    },
    breakdown: {
      byService: breakdownByService,
      byDay: breakdownByDay,
    },
    comparison: {
      ytdVsLastYear: {
        revenueChange: revenueChangeYoY,
        profitChange: profitChangeYoY,
        invoiceCountChange: invoiceCountChangeYoY,
      },
      monthVsLastMonth: {
        revenueChange: revenueChangeMonth,
        profitChange: profitChangeMonth,
      },
    },
    insights,
  };
}

/**
 * Generate AI insights from metrics
 */
function generateInsights(
  monthRevenue: number,
  monthProfit: number,
  monthMargin: number,
  invoiceCount: number,
  revenueChangeMonth: number,
  profitChangeMonth: number
): string[] {
  const insights: string[] = [];

  if (monthRevenue === 0) {
    insights.push('No revenue recorded this month. Focus on booking appointments and closing sales.');
    return insights;
  }

  // Revenue trend
  if (revenueChangeMonth > 20) {
    insights.push(`📈 Revenue up ${revenueChangeMonth.toFixed(1)}% this month—strong growth trend.`);
  } else if (revenueChangeMonth < -20) {
    insights.push(`📉 Revenue down ${Math.abs(revenueChangeMonth).toFixed(1)}% vs last month—review sales activity.`);
  } else if (revenueChangeMonth > 0) {
    insights.push(`📊 Revenue up slightly (${revenueChangeMonth.toFixed(1)}%) this month.`);
  }

  // Profitability
  if (monthMargin > 50) {
    insights.push(`💰 Profit margin at ${monthMargin.toFixed(1)}%—excellent profitability.`);
  } else if (monthMargin < 20) {
    insights.push(`⚠️ Profit margin at ${monthMargin.toFixed(1)}%—consider reviewing pricing or costs.`);
  } else {
    insights.push(`💵 Profit margin at ${monthMargin.toFixed(1)}%—healthy profitability.`);
  }

  // Invoice volume
  if (invoiceCount < 5) {
    insights.push(`📝 Only ${invoiceCount} invoices this month—increase booking volume to grow revenue.`);
  } else if (invoiceCount > 30) {
    insights.push(`🚀 ${invoiceCount} invoices this month—strong sales performance.`);
  }

  // Average invoice value
  const avgInvoiceValue = monthRevenue / invoiceCount;
  if (avgInvoiceValue < 100) {
    insights.push(
      `💡 Average invoice: $${avgInvoiceValue.toFixed(0)}—consider premium services or bundling.`
    );
  } else if (avgInvoiceValue > 500) {
    insights.push(
      `⭐ Average invoice: $${avgInvoiceValue.toFixed(0)}—strong average deal size.`
    );
  }

  return insights;
}

/**
 * Health check endpoint
 */
export async function health(): Promise<{ status: string; timestamp: string }> {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Export metrics as JSON (for API response)
 */
export async function exportMetrics(businessId: string, format: 'json' | 'csv' = 'json') {
  const metrics = await getDashboardMetrics(businessId);
  
  if (format === 'json') {
    return metrics;
  }

  // CSV export (simple format)
  const lines = [
    'Metric,Today,This Month,This Year,Last Month,Last Year',
    `Revenue,$${metrics.revenue.today},$${metrics.revenue.thisMonth},$${metrics.revenue.thisYear},$${metrics.revenue.lastMonthSame},$${metrics.revenue.lastYearSame}`,
    `Profit,$${metrics.profit.today},$${metrics.profit.thisMonth},$${metrics.profit.thisYear},$${metrics.profit.lastMonthSame},$${metrics.profit.lastYearSame}`,
    `Margin,${metrics.margin.today.toFixed(1)}%,${metrics.margin.thisMonth.toFixed(1)}%,${metrics.margin.thisYear.toFixed(1)}%,${metrics.margin.lastMonthSame.toFixed(1)}%,${metrics.margin.lastYearSame.toFixed(1)}%`,
  ];

  return lines.join('\n');
}
