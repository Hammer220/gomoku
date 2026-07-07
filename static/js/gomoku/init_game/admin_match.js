// ============================================================
// 游戏大厅初始化 - 管理后台对局监控与记录管理
// 负责：对局列表刷新/强制关闭/重启/关闭所有房间、
//       记录查看/关闭/导出/筛选、管理员账号管理
// ============================================================
(function() {
    var G = window.Gomoku;
    var $ = function(id) { return document.getElementById(id); };

    // 刷新对局列表
    var refreshMatchListBtn = $('refreshMatchListBtn');
    if (refreshMatchListBtn) refreshMatchListBtn.addEventListener('click', G.loadMatchList);

    // 强制关闭对局
    var forceCloseMatchBtn = $('forceCloseMatchBtn');
    if (forceCloseMatchBtn) forceCloseMatchBtn.addEventListener('click', G.forceCloseMatch);

    // 强制重启对局
    var forceRestartMatchBtn = $('forceRestartMatchBtn');
    if (forceRestartMatchBtn) forceRestartMatchBtn.addEventListener('click', G.forceRestartMatch);

    // 强制关闭所有房间
    var forceCloseAllRoomsBtn = $('forceCloseAllRoomsBtn');
    if (forceCloseAllRoomsBtn) forceCloseAllRoomsBtn.addEventListener('click', G.forceCloseAllRooms);

    // 查看所有记录
    var viewAllRecordsBtn = $('viewAllRecordsBtn');
    if (viewAllRecordsBtn) viewAllRecordsBtn.addEventListener('click', G.viewAllRecords);

    // 关闭所有记录弹窗
    var closeAllRecordsBtn = $('closeAllRecordsBtn');
    if (closeAllRecordsBtn) closeAllRecordsBtn.addEventListener('click', G.closeAllRecordsModal);

    // 导出记录
    var exportRecordsBtn = $('exportRecordsBtn');
    if (exportRecordsBtn) exportRecordsBtn.addEventListener('click', G.exportRecords);

    // 记录用户筛选
    var recordsUserFilter = $('recordsUserFilter');
    if (recordsUserFilter) {
        recordsUserFilter.addEventListener('change', function() {
            if (G.allRecordsData) {
                G.renderRecords(G.allRecordsData, recordsUserFilter.value);
            }
        });
    }

    // 创建管理员账号
    var createAdminBtn = $('createAdminBtn');
    if (createAdminBtn) createAdminBtn.addEventListener('click', G.createAdminAccount);

    // 刷新管理员列表
    var refreshAdminsBtn = $('refreshAdminsBtn');
    if (refreshAdminsBtn) refreshAdminsBtn.addEventListener('click', G.loadAdminList);
})();