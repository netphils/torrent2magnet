const { invoke } = window.__TAURI__.core;
const { getCurrentWebview } = window.__TAURI__.webview;
const { listen } = window.__TAURI__.event;
const { writeText } = window.__TAURI__.clipboardManager;

// 监听器清理函数
let cleanupDetectionStarted = null;
let tableData = []; // 存储所有表格数据

let greetInputEl;
let greetMsgEl;

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

window.addEventListener("DOMContentLoaded", () => {
  initializeEventListeners();
  setupDetectionListener();
  setupCopyButton();
  setupSearchInput();
});

async function initializeDragAndDrop() {
  try {
    const webview = getCurrentWebview();
    
    // 监听拖拽事件
    const unlisten = await webview.onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        // 文件悬停在页面上方
        //console.log('User hovering at position:', event.payload.position);
        
        // 在这里添加视觉反馈
        document.body.classList.add('drag-over');
      } 
      else if (event.payload.type === 'drop') {
        // 文件被拖放到页面
        console.log('User dropped files:', event.payload.paths);
        
        // 移除拖拽悬停状态
        document.body.classList.remove('drag-over');
        
        // 调用处理函数，传入文件路径列表
        handleDroppedFiles(event.payload.paths);
      } 
      else {
        // 拖拽取消
        console.log('File drop cancelled');
        
        // 移除拖拽悬停状态
        document.body.classList.remove('drag-over');
      }
    });
    
    console.log('Drag and drop listener initialized');
    
    // 确保在页面卸载时移除监听器
    window.addEventListener('beforeunload', () => {
      unlisten();
      console.log('Drag and drop listener removed');
    });
    
  } catch (error) {
    console.error('Failed to initialize drag and drop:', error);
  }
}

// 处理被拖放的文件
function handleDroppedFiles(filePaths) {
  const checkbox = document.getElementById('full-link');
  console.log('Processing dropped files:', filePaths);
  
  // 清空表格
  clearTable();

  // 调用后端API
  invoke('torrent_to_magnet', {path_list: filePaths, full_link: checkbox.checked});
  
  // 调试：仅打印文件路径
  filePaths.forEach((path, index) => {
    console.log(`File ${index + 1}: ${path}`);
  });
}

// 初始化拖拽功能
document.addEventListener('DOMContentLoaded', () => {
  // 初始化拖拽监听
  initializeDragAndDrop();
  
  // 添加CSS类用于拖拽状态
  addDragDropStyles();
});

// 添加拖拽相关的样式
function addDragDropStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .drag-over {
      outline: 2px dashed #4a90e2;
      outline-offset: -2px;
      background-color: rgba(74, 144, 226, 0.05);
    }
  `;
  document.head.appendChild(style);
}

// 初始化事件监听器
function initializeEventListeners() {
  console.log('应用初始化完成');
}

// 设置检测事件监听器
function setupDetectionListener() {
  // 设置新的监听器
  listen('send_torrent', (event) => {
    console.log('收到检测开始事件:', event.payload);
    
    // 从事件中提取数据
    const { name, path, link } = event.payload;
    
    // 创建新的数据对象
    const newRowData = {
      name: name || '',
      path: path || '',
      link: link || '',
      id: Date.now() + Math.random() // 生成唯一ID
    };
    
    // 添加到数据数组
    tableData.push(newRowData);
    
    // 重新渲染整个表格（保持搜索过滤）
    renderTable();
  }).then((cleanup) => {
    cleanupDetectionStarted = cleanup;
  }).catch(error => {
    console.error('设置事件监听失败:', error);
  });
}

// 设置复制按钮功能
function setupCopyButton() {
  const copyButton = document.querySelector('.copy-button');
  if (!copyButton) return;
  
  copyButton.addEventListener('click', () => {
    // 获取所有可见行的链接
    const visibleRows = getVisibleRows();
    const links = visibleRows.map(row => row.link);
    
    // 将链接拼接为每行一个的字符串
    const linksString = links.join('\n');
    
    // 输出到控制台
    console.log('要复制的链接字符串:');
    console.log(linksString);
    
    // 调用Tauri2 API进行复制
    writeText(linksString).then(() => {
      // 显示复制成功提示
      showNotification(`已复制 ${visibleRows.length} 个链接到剪贴板`);
    })
    .catch((error) => {
      showNotification('复制失败: ' + error.message);
    });
  });
}

// 设置搜索输入框
function setupSearchInput() {
  const searchInput = document.querySelector('.search-input');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (event) => {
    const searchTerm = event.target.value.trim();
    renderTable(searchTerm);
  });
}

// 渲染表格
async function renderTable(searchTerm = '') {
  const tbody = document.querySelector('.table-body');
  if (!tbody) return;
  
  // 清空现有行
  tbody.innerHTML = '';
  
  try {
    // 从后端获取过滤后的数据
    const filteredData = searchTerm ? await invoke('filter_data', {
      table_data: tableData,
      keyword: searchTerm
    }):
    tableData;
    
    // 如果没有数据，显示空状态
    if (filteredData.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="3" class="empty-message">
          ${searchTerm ? '没有找到匹配的链接' : '暂无数据'}
        </td>
      `;
      tbody.appendChild(emptyRow);
      return;
    }
    
    // 添加新行
    filteredData.forEach(rowData => {
      const row = createTableRow(rowData);
      tbody.appendChild(row);
    });
    
  } catch (error) {
    console.error('渲染表格失败:', error);
    // 显示错误信息
    const errorRow = document.createElement('tr');
    errorRow.innerHTML = `
      <td colspan="3" class="error-message">
        加载数据失败，请稍后重试
      </td>
    `;
    tbody.appendChild(errorRow);
  }
}

// 创建表格行
function createTableRow(data) {
  const row = document.createElement('tr');
  row.dataset.id = data.id;
  
  // 创建文件名单元格
  const nameCell = document.createElement('td');
  nameCell.className = 'column-files';
  nameCell.textContent = data.name;
  
  // 创建路径单元格
  const pathCell = document.createElement('td');
  pathCell.className = 'column-path';
  pathCell.textContent = data.path;
  
  // 创建链接单元格
  const linkCell = document.createElement('td');
  linkCell.className = 'column-link';
  
  // 根据复选框决定显示完整链接还是仅显示文件名
  const linkElement = document.createElement('a');
  linkElement.href = data.link;
  linkElement.textContent = data.link;
  linkElement.target = '_blank';
  linkElement.rel = 'noopener noreferrer';
  linkCell.appendChild(linkElement);
  
  // 组装行
  row.appendChild(nameCell);
  row.appendChild(pathCell);
  row.appendChild(linkCell);
  
  return row;
}

// 获取所有可见行
function getVisibleRows() {
  const tbody = document.querySelector('.table-body');
  if (!tbody) return [];
  
  const visibleRows = [];
  const rows = tbody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const linkCell = row.querySelector('.column-link a');
    if (linkCell) {
      visibleRows.push({
        name: row.querySelector('.column-files').textContent,
        path: row.querySelector('.column-path').textContent,
        link: linkCell.textContent
      });
    }
  });
  
  return visibleRows;
}

// 显示通知
function showNotification(message) {
  // 移除已存在的通知
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // 创建新通知
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    z-index: 1000;
    animation: fadeInOut 2s ease-in-out;
  `;
  
  // 添加CSS动画
  if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-20px); }
        15% { opacity: 1; transform: translateY(0); }
        85% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // 2秒后自动移除
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 2000);
}

// 清空表格函数
function clearTable() {
  // 清空数据数组
  tableData = [];
  
  // 获取表格tbody元素
  const tbody = document.querySelector('.table-body');
  if (tbody) {
    // 清空表格内容
    tbody.innerHTML = '';
  }
  
  // 清空搜索框
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.value = '';
  }
  
  console.log('表格已清空');
}

// 清理函数
function cleanup() {
  if (cleanupDetectionStarted) {
    cleanupDetectionStarted();
    cleanupDetectionStarted = null;
  }
}

// 页面卸载时清理
window.addEventListener('beforeunload', cleanup);