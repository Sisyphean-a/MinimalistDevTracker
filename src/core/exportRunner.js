const path = require('node:path');

const { buildExportPayload } = require('./exportPayload');

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatExportStamp(timestamp) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function hasProjects(reportData) {
  return reportData?.projects && Object.keys(reportData.projects).length > 0;
}

function isCurrentProjectBranchFiltered(input, reportRequest) {
  if (input?.scopeType !== 'currentProject') {
    return false;
  }
  if (!reportRequest?.branch) {
    return false;
  }
  return input.branchMode === 'current' || input.branchMode === 'named';
}

function createExportReportRunner(options) {
  const now = options.now ?? (() => Date.now());

  return async function runExport(input) {
    const selectedDir = await options.selectFolder();
    if (!selectedDir) {
      return null;
    }

    const reportRequest = {
      repoPaths: input.repoPaths,
      branch: input.branch,
      startDate: input.startDate,
      endDate: input.endDate
    };
    if (Array.isArray(input.projectBranches)) {
      reportRequest.projectBranches = input.projectBranches;
    }
    let reportData = await options.storage.readReportData(reportRequest);
    if (!hasProjects(reportData) && isCurrentProjectBranchFiltered(input, reportRequest)) {
      const fallbackReportData = await options.storage.readReportData({
        ...reportRequest,
        branch: null
      });
      if (hasProjects(fallbackReportData)) {
        await options.showWarningMessage('当前分支在所选日期范围内没有可导出的数据，请改为“全部分支”或调整日期范围。');
        return null;
      }
      reportData = fallbackReportData;
    }
    if (!hasProjects(reportData)) {
      await options.showWarningMessage('当前筛选条件下没有可导出的数据。');
      return null;
    }

    const exportedAt = now();
    const outputDir = path.join(selectedDir, `minimalist-dev-tracker-export-${formatExportStamp(exportedAt)}`);
    const payload = buildExportPayload(reportData, input, exportedAt);
    const result = await options.reportExporter.exportToDirectory({
      outputDir,
      exportType: input.exportType,
      format: input.format,
      payload
    });
    await options.showInfoMessage(`导出完成：${result.outputDir}`);
    return result;
  };
}

module.exports = {
  createExportReportRunner
};
