import * as thesisGuidanceEvaluationService from '../services/thesisGuidanceEvaluation.service.js';
import prisma from '../config/prisma.js';

export async function submitEvaluation(req, res, next) {
  try {
    const userId = req.user.sub || req.user.id;
    const lecturer = await prisma.lecturer.findFirst({
      where: { id: userId },
    });
    if (!lecturer) {
      const err = new Error('Anda tidak terdaftar sebagai dosen');
      err.statusCode = 403;
      throw err;
    }
    const result = await thesisGuidanceEvaluationService.submitEvaluation(lecturer.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function kadepReviewEvaluation(req, res, next) {
  try {
    const userId = req.user.sub || req.user.id;
    const { id } = req.params;
    const result = await thesisGuidanceEvaluationService.kadepReviewEvaluation(id, userId, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getPendingEvaluations(req, res, next) {
  try {
    const result = await thesisGuidanceEvaluationService.getPendingEvaluations();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getEvaluationsForThesis(req, res, next) {
  try {
    const { thesisId } = req.params;
    const userId = req.user.sub || req.user.id;
    const lecturer = await prisma.lecturer.findFirst({
      where: { id: userId },
    });
    if (!lecturer) {
      const err = new Error('Anda tidak terdaftar sebagai dosen');
      err.statusCode = 403;
      throw err;
    }
    const result = await thesisGuidanceEvaluationService.getEvaluationsForThesis(thesisId, lecturer.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
