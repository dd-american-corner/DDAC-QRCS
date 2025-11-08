// Password Modal Logic
const passwordModal = document.getElementById('passwordModal');
const passwordInput = document.getElementById('passwordInput');
const passwordBtn = document.getElementById('passwordBtn');
const passwordError = document.getElementById('passwordError');
const PASSWORD = "Daas";
let pendingClearHistory = false;
let pendingDeleteItem = null;

function showPasswordModal() {
  passwordModal.classList.remove('hide');
  passwordModal.style.display = 'flex';
  passwordInput.value = '';
  passwordError.style.display = 'none';
  passwordInput.focus();
}
function hidePasswordModal() {
  passwordModal.classList.add('hide');
  setTimeout(() => { 
    passwordModal.style.display = 'none';
    passwordModal.classList.remove('hide');
  }, 400);
}
function checkPassword() {
  if (passwordInput.value === "") {
    passwordError.textContent = "empty";
    passwordError.style.display = 'block';
    return;
  }
  if (passwordInput.value === PASSWORD) {
    sessionStorage.setItem('qrAccess', '1');
    hidePasswordModal();
    
    // Check if we need to clear history after password validation
    if (pendingClearHistory) {
      pendingClearHistory = false;
      clearHistory();
    }
    
    // Check if we need to delete a specific item after password validation
    if (pendingDeleteItem !== null) {
      const itemToDelete = pendingDeleteItem;
      pendingDeleteItem = null;
      deleteHistoryItem(itemToDelete.number, itemToDelete.event);
    }
  } else {
    passwordError.textContent = "incorrect";
    passwordError.style.display = 'block';
    passwordInput.value = '';
    passwordInput.focus();
  }
}
passwordBtn.onclick = checkPassword;
passwordInput.onkeydown = function(e) {
  if (e.key === 'Enter') checkPassword();
};
if (sessionStorage.getItem('qrAccess') !== '1') {
  showPasswordModal();
} else {
  passwordModal.style.display = 'none';
}
window.addEventListener('beforeunload', () => {
  sessionStorage.removeItem('qrAccess');
});

// Export Modal Logic
const exportModal = document.getElementById('exportModal');

function showExportModal() {
  if (scanHistory.length === 0) {
    showToast("No scans to export");
    return;
  }
  exportModal.classList.add('active');
}

function closeExportModal() {
  exportModal.classList.remove('active');
}

function exportAs(format) {
  closeExportModal();
  
  switch(format) {
    case 'pdf':
      downloadPDF();
      break;
    case 'msword':
      downloadMSWord();
      break;
    default:
      showToast("Invalid export format");
  }
}

const video = document.getElementById("scanner");
const fileInput = document.getElementById("fileInput");
const resultDiv = document.getElementById("result");
const scannerBox = document.getElementById("scannerBox");
const scannerOverlay = document.getElementById("scannerOverlay");
const statusText = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const fileBtn = document.getElementById("fileBtn");
const clearBtn = document.getElementById("clearBtn");
const historyList = document.getElementById("historyList");
const historyCount = document.getElementById("historyCount");
const toast = document.getElementById("toast");
const timerDisplay = document.getElementById("timer");
const downloadBtn = document.getElementById("downloadBtn");
const historySection = document.getElementById("historySection");
const cameraPermission = document.getElementById("cameraPermission");
const studentListSection = document.getElementById("studentListSection");
const studentListContent = document.getElementById("studentListContent");

timerDisplay.addEventListener('dblclick', function() {
  if (timerActive) {
    stopTimer();
    disableAllButtonsExceptExport();
  }
});

let stream = null;
let scanning = false;
let scanHistory = [];
let currentScanNumber = 1;
let lastScannedContent = null;
let duplicateWarningTimeout = null;
let scannerTimeout = null;
let scanTimer = null;
let timeLeft = 30 * 60;
let timerActive = false;
let isPausedForResultDisplay = false;
let timerStartTime = null;
let timerPausedTime = null;
let audioContext = null; // For Web Audio API
let currentFacingMode = "environment"; // Track current camera facing mode

function initializeFromStorage() {
  try {
    const savedHistory = localStorage.getItem('qrScanHistory');
    if (savedHistory) {
      scanHistory = JSON.parse(savedHistory);
      currentScanNumber = scanHistory.length > 0 ? scanHistory[scanHistory.length - 1].number + 1 : 1;
      updateHistoryDisplay();
      updateHistoryCount();
    }
    const savedTimerState = localStorage.getItem('qrTimerState');
    if (savedTimerState) {
      const timerState = JSON.parse(savedTimerState);
      const currentTime = Date.now();
      const elapsedSeconds = Math.floor((currentTime - timerState.startTime) / 1000);
      if (timerState.active && elapsedSeconds < timerState.duration) {
        timeLeft = timerState.duration - elapsedSeconds;
        timerActive = true;
        timerStartTime = currentTime - (timerState.duration - timeLeft) * 1000;
        startTimer();
      } else if (timerState.active) {
        timeLeft = 0;
        timerActive = false;
        timerDisplay.textContent = "Time expired";
        disableAllButtonsExceptExport();
      }
    }
  } catch (e) {
    console.error("Error loading from storage:", e);
    clearLocalStorage();
  }
}
function clearLocalStorage() {
  localStorage.removeItem('qrScanHistory');
  localStorage.removeItem('qrTimerState');
  scanHistory = [];
  currentScanNumber = 1;
  updateHistoryDisplay();
  updateHistoryCount();
}
function saveTimerState() {
  if (timerActive) {
    const timerState = {
      active: true,
      startTime: timerStartTime,
      duration: 30 * 60,
      timeLeft: timeLeft
    };
    localStorage.setItem('qrTimerState', JSON.stringify(timerState));
  } else {
    localStorage.removeItem('qrTimerState');
  }
}
initializeFromStorage();
fileInput.addEventListener('change', handleFileUpload);
window.addEventListener('beforeunload', () => {
  saveTimerState();
  stopCamera();
  if (duplicateWarningTimeout) {
    clearTimeout(duplicateWarningTimeout);
  }
  if (scannerTimeout) {
    cancelAnimationFrame(scannerTimeout);
  }
});
function toggleHistory() {
  historySection.classList.toggle('active');
  const studentListBtn = document.querySelector('.toggle-student-list');
  if (historySection.classList.contains('active')) {
    studentListBtn.style.display = 'none';
  } else {
    studentListBtn.style.display = 'flex';
  }
}
function toggleStudentList() {
  if (studentListSection.classList.contains('active')) {
    studentListSection.classList.remove('active');
    studentListSection.classList.add('fade-out');
    setTimeout(() => {
      studentListSection.classList.remove('fade-out');
      studentListSection.style.display = 'none';
    }, 400);
  } else {
    studentListSection.style.display = 'flex';
    setTimeout(() => {
      studentListSection.classList.add('active');
    }, 10);
    updateStudentListDisplay();
  }
}
function playBeep() {
  try {
    // Create audio context if it doesn't exist
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Create oscillator
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Configure oscillator
    oscillator.type = 'square';
    oscillator.frequency.value = 1300; // 1300Hz
    
    // Configure gain (volume)
    gainNode.gain.value = 0.5; // 50% volume
    
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Start and stop the oscillator
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.09); // Play for 0.09 seconds
  } catch (e) {
    console.log("Beep error:", e);
  }
}
function vibrate() {
  if (navigator.vibrate) {
    navigator.vibrate(200);
  }
}
function startTimer() {
  timerDisplay.style.display = 'block';
  if (timerPausedTime) {
    const pausedDuration = Date.now() - timerPausedTime;
    timerStartTime += pausedDuration;
    timerPausedTime = null;
  } else if (!timerStartTime) {
    timeLeft = 30 * 60;
    timerStartTime = Date.now();
  }
  timerActive = true;
  updateTimerDisplay();
  scanTimer = setInterval(() => {
    const currentTime = Date.now();
    const elapsedSeconds = Math.floor((currentTime - timerStartTime) / 1000);
    timeLeft = Math.max(0, 30 * 60 - elapsedSeconds);
    updateTimerDisplay();
    if (timeLeft <= 0) {
      stopTimer();
      disableAllButtonsExceptExport();
    }
  }, 1000);
  saveTimerState();
}
function stopTimer() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  timerActive = false;
  timerPausedTime = Date.now();
  timerDisplay.textContent = "Time expired";
  saveTimerState();
}
function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
function disableAllButtonsExceptExport() {
  fileBtn.disabled = true;
  startBtn.disabled = true;
  // it should remain enabled even after timer expires
  // clearBtn.disabled = true;
  fileBtn.classList.add('disabled');
  startBtn.classList.add('disabled');
  // Don't add disabled class to clearBtn
  // clearBtn.classList.add('disabled');
  stopCamera();
  showStatus("Scanning time expired");
}
function enableAllButtons(showToast = true) {
  fileBtn.disabled = false;
  startBtn.disabled = false;
  clearBtn.disabled = scanHistory.length === 0;
  fileBtn.classList.remove('disabled');
  startBtn.classList.remove('disabled');
  clearBtn.classList.remove('disabled');
  timerActive = false;
  timerStartTime = null;
  timerPausedTime = null;
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  localStorage.removeItem('qrTimerState');
  showStatus("Ready to scan");
  if (showToast) {
    showToast("Buttons re-enabled");
  }
}
function resetTimerState() {
  timeLeft = 30 * 60;
  timerActive = false;
  timerStartTime = null;
  timerPausedTime = null;
  updateTimerDisplay();
  localStorage.removeItem('qrTimerState');
  // Show the timer after reset
  timerDisplay.style.display = 'block';
}
function requestClearHistory() {
  if (scanHistory.length === 0) {
    showToast("History is already empty");
    return;
  }
  if (confirm("Are you sure you want to clear all scan history?")) {
    // Set flag to clear history after password validation
    pendingClearHistory = true;
    // Show password modal
    showPasswordModal();
  }
}
function requestDeleteHistoryItem(number, event) {
  // Set flag to delete item after password validation
  pendingDeleteItem = { number: number, event: event };
  // Show password modal
  showPasswordModal();
}
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  showStatus("Processing image...");
  const reader = FileReader ? new FileReader() : new ActiveXObject('Scripting.FileSystemObject');
  reader.onload = function(ev) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });
        if (code) {
          // Play beep and vibrate for successful scan
          playBeep();
          vibrate();
          processScannedCode(code.data);
          if (!timerActive) {
            startTimer();
          }
        } else {
          showStatus("No QR code in image", true);
          // Set timeout to clear error message and resume scanning
          const clearErrorTimeout = setTimeout(() => {
            resultDiv.style.display = 'none';
            showStatus("Ready to scan.");
            // Automatically resume scanning if camera is active
            if (scanning) {
              scanFrame();
            }
          }, 3500);
          
          // Try enhanced detection
          const foundByEnhanced = tryEnhancedDetection(canvas, ctx);
          if (foundByEnhanced) {
            clearTimeout(clearErrorTimeout); // Clear timeout if QR found
          }
        }
      } catch (error) {
        showStatus("Image processing error", true);
        console.error(error);
      }
    };
    img.onerror = () => {
      showStatus("Invalid image file", true);
    };
    img.src = ev.target.result;
  };
  reader.onerror = () => {
    showStatus("File read error", true);
  };
  reader.readAsDataURL(file);
}
function tryEnhancedDetection(canvas, ctx) {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const techniques = [
    () => {
      tempCtx.drawImage(canvas, 0, 0);
      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
      }
      tempCtx.putImageData(imageData, 0, 0);
      return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    },
    () => {
      tempCtx.drawImage(canvas, 0, 0);
      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const data = imageData.data;
      const factor = 1.5;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = factor * (data[i] - 128) + 128;
        data[i + 1] = factor * (data[i + 1] - 128) + 128;
        data[i + 2] = factor * (data[i + 2] - 128) + 128;
      }
      tempCtx.putImageData(imageData, 0, 0);
      return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    },
    () => {
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  ];
  for (let i = 0; i < techniques.length; i++) {
    try {
      const processedImageData = techniques[i]();
      const code = jsQR(processedImageData.data, processedImageData.width, processedImageData.height, {
        inversionAttempts: "attemptBoth",
      });
      if (code) {
        // Play beep and vibrate for successful scan
        playBeep();
        vibrate();
        processScannedCode(code.data);
        if (!timerActive) {
          startTimer();
        }
        return true; // Return true if QR code found
      }
    } catch (error) {
      console.log("Enhanced technique failed:", error);
    }
  }
  return false; // Return false if no QR code found
}
function requestCameraPermission() {
  cameraPermission.style.display = 'none';
  startCamera();
}
function toggleCamera() {
  if (scanning) {
    stopCamera();
  } else {
    startCamera();
  }
}
function startCamera() {
  if (timerActive && timeLeft <= 0) {
    showToast("Scanning time has expired");
    return;
  }
  resultDiv.style.display = 'none';
  showStatus("Starting camera...");
  fileBtn.disabled = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showStatus("Camera not supported", true);
    fileBtn.disabled = false;
    cameraPermission.style.display = 'block';
    return;
  }
  if (!timerActive) {
    startTimer();
  }
  
  // Try to get the requested camera
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: currentFacingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  })
  .then(s => {
    stream = s;
    video.srcObject = stream;
    video.style.display = 'block';
    scannerOverlay.style.display = 'block';
    scannerBox.classList.add('active');
    
    // Add original view class for all cameras
    video.classList.add('original-view');
    
    if (currentFacingMode === "environment") {
      showStatus("Scanning..");
    } else {
      showStatus("Scanning with front camera..");
    }
    
    video.onplaying = () => {
      scanning = true;
      startBtn.classList.remove('btn-start');
      startBtn.classList.add('btn-stop');
      scanFrame();
    };
    video.onerror = () => {
      showStatus("Camera error", true);
      stopCamera();
    };
    video.play().catch(err => {
      showStatus("Error starting camera", true);
      console.error(err);
      stopCamera();
    });
  })
  .catch(err => {
    console.error("Camera access error:", err);
    
    // If the requested camera failed, try the other one
    const fallbackFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: fallbackFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    .then(s => {
      stream = s;
      video.srcObject = stream;
      video.style.display = 'block';
      scannerOverlay.style.display = 'block';
      scannerBox.classList.add('active');
      
      // Add original view class for all cameras
      video.classList.add('original-view');
      
      // Update the current facing mode
      currentFacingMode = fallbackFacingMode;
      
      if (fallbackFacingMode === "environment") {
        showStatus("Scanning with back camera..");
      } else {
        showStatus("Scanning with front camera..");
      }
      
      video.onplaying = () => {
        scanning = true;
        startBtn.classList.remove('btn-start');
        startBtn.classList.add('btn-stop');
        scanFrame();
      };
    })
    .catch(err => {
      console.error("Fallback camera also failed:", err);
      showStatus("Camera access denied", true);
      fileBtn.disabled = false;
      cameraPermission.style.display = 'block';
      if (err.name === 'NotAllowedError') {
        showToast("Please enable camera permissions in your browser settings");
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        showToast("No camera found on this device");
      }
    });
  });
}
function stopCamera() {
  scanning = false;
  fileBtn.disabled = false;
  video.pause();
  video.style.display = 'none';
  scannerOverlay.style.display = 'none';
  scannerBox.classList.remove('active');
  showStatus("Camera stopped");
  startBtn.classList.remove('btn-stop');
  startBtn.classList.add('btn-start');
  
  // Remove original view class when stopping camera
  video.classList.remove('original-view');
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (scannerTimeout) {
    clearTimeout(scannerTimeout);
    scannerTimeout = null;
  }
}
function scanFrame() {
  if (!scanning || isPausedForResultDisplay || (timerActive && timeLeft <= 0)) {
    return;
  }
  try {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      
      // For front camera, flip the canvas horizontally for proper QR detection
      // but keep the video display in original view
      if (currentFacingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: "dontInvert",
      });
      if (code) {
        // Play beep and vibrate for successful scan
        playBeep();
        vibrate();
        processScannedCode(code.data);
        return;
      }
    }
    scannerTimeout = requestAnimationFrame(scanFrame);
  } catch (error) {
    console.error("Scan error:", error);
    showStatus("Scan error occurred", true);
    stopCamera();
  }
}
function processScannedCode(content) {
  if (content === lastScannedContent) {
    // Play beep and vibrate for duplicate scan
    playBeep();
    vibrate();
    showDuplicateWarning();
    return;
  }
  const isDuplicate = scanHistory.some(item => item.content === content);
  if (isDuplicate) {
    // Play beep and vibrate for duplicate scan
    playBeep();
    vibrate();
    showDuplicateWarning();
    return;
  }
  
  // Check for required fields: Full name, phone, gender
  const extractedData = extractDataFromContent(content);
  const hasFullName = extractedData.fullName && extractedData.fullName.trim() !== "" && extractedData.fullName !== "N/A";
  const hasPhone = extractedData.phone && extractedData.phone.trim() !== "" && extractedData.phone !== "N/A";
  const hasGender = extractedData.gender && extractedData.gender.trim() !== "" && extractedData.gender !== "N/A";
  
  if (!hasFullName || !hasPhone || !hasGender) {
    // Just show status message without 404 display or beep
    showStatus("Missing required fields", true);
    
    // Resume scanning after 2 seconds
    setTimeout(() => {
      resultDiv.style.display = 'none';
      showStatus("Ready to scan.");
      if (scanning) {
        scanFrame();
      }
    }, 2000);
    return;
  }
  
  lastScannedContent = content;
  addToHistory(content);
  showCurrentResult(content);
  showStatus("Scan successful!");
  isPausedForResultDisplay = true;
  setTimeout(() => {
    isPausedForResultDisplay = false;
    resultDiv.style.display = 'none';
    showStatus("Ready to scan...");
    if (scanning) {
      scanFrame();
    }
  }, 3000);
}
function showDuplicateWarning() {
  showStatus("Duplicate detected!", true);
  showCurrentResult("⚠️ Duplicate QR");
  if (duplicateWarningTimeout) {
    clearTimeout(duplicateWarningTimeout);
  }
  duplicateWarningTimeout = setTimeout(() => {
    resultDiv.style.display = 'none';
    showStatus("Ready to scan.");
    // Automatically resume scanning if camera is active
    if (scanning) {
      scanFrame();
    }
  }, 3000);
}
function addToHistory(content) {
  if (!content || content.startsWith("❌")) return;
  const timestamp = new Date().toLocaleString();
  const scanItem = {
    number: currentScanNumber++,
    content: content,
    timestamp: timestamp
  };
  scanHistory.push(scanItem);
  updateHistoryDisplay();
  updateHistoryCount();
  saveHistory();
}
function showCurrentResult(text) {
  resultDiv.innerHTML = text;
  resultDiv.style.display = 'block';
}
function updateHistoryDisplay() {
  if (scanHistory.length === 0) {
    historyList.innerHTML = '<div class="empty-history">No scans yet</div>';
    return;
  }
  historyList.innerHTML = '';
  scanHistory.forEach(item => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    // Extract phone number to remove underline on mobile
    const extractedData = extractDataFromContent(item.content);
    const phoneDisplay = extractedData.phone ? 
      `<span class="phone-number">${extractedData.phone}</span>` : 
      extractedData.phone || "";
    
    historyItem.innerHTML = `
      <div class="history-item-number">${item.number}.</div>
      <div class="history-item-content">${item.content}</div>
      <div class="history-item-actions">
        <button class="history-item-btn" onclick="requestDeleteHistoryItem(${item.number}, event)" title="Delete">✕</button>
      </div>
    `;
    historyList.appendChild(historyItem);
  });
  historyList.scrollTop = historyList.scrollHeight;
}
function updateHistoryCount() {
  const count = scanHistory.length;
  historyCount.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  downloadBtn.disabled = count === 0;
  clearBtn.disabled = count === 0;
}
function updateStudentListDisplay() {
  if (scanHistory.length === 0) {
    studentListContent.innerHTML = '<div class="empty-student-list">No students scanned yet</div>';
    return;
  }
  
  // Extract student data and remove duplicates based on fullName
  const studentDataMap = new Map(); // Using Map to handle duplicates
  
  scanHistory.forEach((item) => {
    const extractedData = extractDataFromContent(item.content);
    const fullName = extractedData.fullName || "N/A";
    
    // Only add if this name hasn't been added before
    if (!studentDataMap.has(fullName)) {
      studentDataMap.set(fullName, {
        fullName: fullName,
        phone: extractedData.phone || "N/A",
        gender: extractedData.gender || "N/A",
        timestamp: item.timestamp
      });
    }
  });
  
  // Convert Map to array and sort by fullName A-Z
  const studentData = Array.from(studentDataMap.values())
    .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }));
  
  let tableHTML = `
    <div style="flex: 1; overflow-y: auto;">
      <table class="student-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Full Name</th>
            <th>Phone</th>
            <th>Gender</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  studentData.forEach((student, idx) => {
    tableHTML += `
      <tr>
        <td>${idx + 1}</td>
        <td>${student.fullName}</td>
        <td><span class="phone-number">${student.phone}</span></td>
        <td>${student.gender}</td>
      </tr>
    `;
  });
  
  tableHTML += `
        </tbody>
      </table>
    </div>
  `;
  
  studentListContent.innerHTML = tableHTML;
}
function extractDataFromContent(content) {
  try {
    const data = JSON.parse(content);
    return {
      fullName: data.fullName || data.name || data.Name || data.FullName || data.nama || data.Nama || "",
      phone: data.phone || data.mobile || data.Phone || data.Mobile || data.telepon || data.Telepon || "",
      gender: data.gender || data.Gender || data.jenisKelamin || data.JenisKelamin || "",
      timestamp: new Date().toLocaleString()
    };
  } catch (e) {
    const nameMatch = content.match(/full name[:=\s]*([^\n,]+)/i);
    const phoneMatch = content.match(/(?:phone|mobile|tel|telepon|telefono|hp|handphone)[:=\s]*([+\d\s\-()]+)/i);
    const genderMatch = content.match(/(?:gender|jenis kelamin|sex)[:=\s]*([^\n,]+)/i);
    let extractedName = nameMatch ? nameMatch[1].trim() : "";
    if (!extractedName) {
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.match(/^[A-Za-z\s\.]+$/) && line.trim().length > 3) {
          extractedName = line.trim();
          break;
        }
      }
    }
    return {
      fullName: extractedName,
      phone: phoneMatch ? phoneMatch[1].trim() : "",
      gender: genderMatch ? genderMatch[1].trim() : "",
      timestamp: new Date().toLocaleString()
    };
  }
}
function downloadPDF() {
  if (scanHistory.length === 0) {
    showToast("No scans to export");
    return;
  }
  try {
    if (typeof window.jspdf === 'undefined') {
      showToast("PDF library not loaded. Using fallback method.", true);
      downloadTextFallback();
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFillColor(51, 1, 31);
    doc.rect(0, 0, 220, 20, 'F');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("DDAC student attendance", 105, 12, { align: "center" });
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    // Only show date, not time
    const date = new Date().toLocaleDateString();
    doc.text(`On: ${date}`, 105, 18, { align: "center" });
    doc.setTextColor(0, 0, 0);
    // Sort by fullName A-Z
    const tableData = scanHistory
      .map((item, index) => {
        const extractedData = extractDataFromContent(item.content);
        return [
          extractedData.fullName || "N/A",
          extractedData.phone || "N/A",
          extractedData.gender || "N/A",
          // Only show date, not time in the table
          new Date(item.timestamp).toLocaleDateString()
        ];
      })
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
      .map((row, idx) => [idx + 1, ...row]);
    doc.autoTable({
      head: [['#', 'Full Name', 'Phone', 'Gender', 'Date']],
      body: tableData,
      startY: 30,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3,
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [51, 1, 31],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      alternateRowStyles: {
        fillColor: [241, 245, 249]
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 60 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 45 }
      },
      margin: { top: 25 }
    });
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`${pageCount}`, 200, 285, { align: "right" });
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const pdfDataUri = doc.output('datauristring');
    const downloadLink = document.createElement('a');
    downloadLink.href = pdfDataUri;
    downloadLink.download = `DDAC student attendance_${dateStr}.pdf`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    showToast("PDF downloaded");
  } catch (e) {
    console.error("PDF export error:", e);
    showToast("Error generating PDF report", true);
    downloadTextFallback();
  }
}
function downloadMSWord() {
  if (scanHistory.length === 0) {
    showToast("No scans to export");
    return;
  }
  try {
    // Create HTML content that MS Word can open
    let htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Sunday Schedule Attendance</title>
        <style>
          body { font-family: 'Calibri', sans-serif; }
          h1 { color: #33011F; text-align: center; }
          .date-info { text-align: center; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #33011F; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
          .footer { text-align: right; color: #666; font-size: 10px; }
          @page {
            size: A4;
            margin: 2cm;
            @bottom-right {
              content: "Page " counter(page) " of " counter(pages);
              font-size: 10px;
              color: #666;
            }
          }
        </style>
      </head>
      <body>
        <h1>DDAC student attendance</h1>
        <div class="date-info">On: ${new Date().toLocaleDateString()}</div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Full Name</th>
              <th>Phone</th>
              <th>Gender</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    // Sort by fullName A-Z
    const sortedData = scanHistory
      .map((item, index) => {
        const extractedData = extractDataFromContent(item.content);
        return {
          number: index + 1,
          fullName: extractedData.fullName || "N/A",
          phone: extractedData.phone || "N/A",
          gender: extractedData.gender || "N/A",
          // Only show date, not time in the table
          timestamp: new Date(item.timestamp).toLocaleDateString()
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }));
    
    // Add table rows
    sortedData.forEach((item, idx) => {
      htmlContent += `
        <tr>
          <td>${idx + 1}</td>
          <td>${item.fullName}</td>
          <td>${item.phone}</td>
          <td>${item.gender}</td>
          <td>${item.timestamp}</td>
        </tr>
      `;
    });
    
    htmlContent += `
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    // Create blob and download
    const blob = new Blob(['\ufeff', htmlContent], {
      type: 'application/msword'
    });
    
    const dateStr = new Date().toISOString().slice(0, 10);
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `DDAC student attendance_${dateStr}.doc`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    showToast("MS Word document downloaded");
  } catch (e) {
    console.error("MS Word export error:", e);
    showToast("Error generating MS Word document", true);
    downloadTextFallback();
  }
}
function downloadTextFallback() {
  try {
    let textContent = "QR Code Scan\n\n";
    textContent += "Generated on: " + new Date().toLocaleDateString() + "\n\n";
    
    // Sort scanHistory by fullName A-Z before generating the text content
    const sortedHistory = [...scanHistory].sort((a, b) => {
      const nameA = extractDataFromContent(a.content).fullName || "N/A";
      const nameB = extractDataFromContent(b.content).fullName || "N/A";
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
    
    sortedHistory.forEach((item, index) => {
      const extractedData = extractDataFromContent(item.content);
      // Only show date, not time
      const dateOnly = new Date(item.timestamp).toLocaleDateString();
      textContent += `${index + 1}. ${extractedData.fullName || "N/A"} | ${extractedData.phone || "N/A"} | ${extractedData.gender || "N/A"} | ${dateOnly}\n`;
    });
    
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DDAC student attendance_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded as text file instead");
  } catch (fallbackError) {
    console.error("Fallback also failed:", fallbackError);
    showToast("Export failed completely", true);
  }
}
function deleteHistoryItem(number, event) {
  event.stopPropagation();
  scanHistory = scanHistory.filter(i => i.number !== number);
  updateHistoryDisplay();
  updateHistoryCount();
  saveHistory();
  showToast("Item deleted");
}
function clearHistory() {
  scanHistory = [];
  currentScanNumber = 1;
  lastScannedContent = null;
  updateHistoryDisplay();
  updateHistoryCount();
  saveHistory();
  showToast("History cleared");
  
  // Reset timer and enable all buttons without showing toast
  if (timerActive) {
    stopTimer();
  }
  resetTimerState();
  enableAllButtons(false); // Pass false to prevent showing toast
}
function saveHistory() {
  try {
    localStorage.setItem('qrScanHistory', JSON.stringify(scanHistory));
  } catch (e) {
    console.error("Error saving history:", e);
    showToast("Error saving history", true);
  }
}
function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.className = isError ? 'status error-text' : 'status';
}
function showToast(message, duration = 2000, isError = false) {
  toast.textContent = message;
  toast.className = isError ? 'toast error-text' : 'toast';
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}
updateHistoryCount();