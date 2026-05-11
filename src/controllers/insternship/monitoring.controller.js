import * as monitoringService from '../../services/insternship/monitoring.service.js';

export const getMonitoringStats = async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        const data = await monitoringService.getInternshipMonitoringStats(academicYearId);
        return res.status(200).json({
            success: true,
            message: 'Monitoring stats retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};

export const getMonitoringList = async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        const data = await monitoringService.getDetailedMonitoringList(academicYearId);
        return res.status(200).json({
            success: true,
            message: 'Monitoring list retrieved successfully',
            data
        });
    } catch (error) {
        next(error);
    }
};
