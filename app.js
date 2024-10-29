const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let recorder, audioChunks = [], loops = [];
let visualizerCount = 0;

const clickSound = new Audio('click-sound.mp3'); // 클릭 사운드 파일 경로

document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
        clickSound.currentTime = 0;  
        clickSound.play();  
    });
});

// 웹캠 비디오 스트림을 가져옴 (오디오 무음)
const video = document.createElement('video');
video.autoplay = true;

let mediaStream;

// 웹캠 비디오와 마이크 오디오 스트림을 가져옴
Promise.all([
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
    navigator.mediaDevices.getUserMedia({ audio: true })
]).then(streams => {
    const videoStream = streams[0];
    const audioStream = streams[1];
    
    mediaStream = new MediaStream([...videoStream.getTracks(), ...audioStream.getTracks()]);
    video.srcObject = videoStream;
});

// 필터 적용 캔버스와 메인 캔버스 설정
const webcamCanvas = document.createElement('canvas');
webcamCanvas.width = 640;
webcamCanvas.height = 480;

const mainCanvas = document.createElement('canvas');
mainCanvas.width = 640;
mainCanvas.height = 480;
document.getElementById('visualizers-container').appendChild(mainCanvas);

const webcamCanvasCtx = webcamCanvas.getContext('2d');
const mainCanvasCtx = mainCanvas.getContext('2d');

// 필터 상태 관리
const filterStates = {
    origin: true,
    grayscale: false,
    negative: false // 네거티브 상태 추가
};

// 필터 적용 함수
function applyFilter() {
    webcamCanvasCtx.drawImage(video, 0, 0, webcamCanvas.width, webcamCanvas.height);
    
    if (filterStates.grayscale) {
        webcamCanvasCtx.filter = 'grayscale(100%)';
        webcamCanvasCtx.drawImage(webcamCanvas, 0, 0);
    } else if (filterStates.negative) {
        const imageData = webcamCanvasCtx.getImageData(0, 0, webcamCanvas.width, webcamCanvas.height);
        const negativeData = applyNegative(imageData);
        webcamCanvasCtx.putImageData(negativeData, 0, 0);
    } else {
        webcamCanvasCtx.filter = 'none';
        webcamCanvasCtx.drawImage(webcamCanvas, 0, 0);
    }
}

// 네거티브 효과 적용 함수
function applyNegative(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];       // Red
        data[i + 1] = 255 - data[i + 1]; // Green
        data[i + 2] = 255 - data[i + 2]; // Blue
    }
    return imageData;
}

// 웹캠과 비주얼라이저를 그리는 함수
function draw() {
    requestAnimationFrame(draw);
    
    // 메인 캔버스에 필터 적용된 웹캠 화면을 그리기
    mainCanvasCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    applyFilter();
    mainCanvasCtx.drawImage(webcamCanvas, 0, 0, mainCanvas.width, mainCanvas.height);

    // 왼쪽 세로선 그리기
    mainCanvasCtx.beginPath();
    mainCanvasCtx.moveTo(0, 0);
    mainCanvasCtx.lineTo(0, mainCanvas.height);
    mainCanvasCtx.lineWidth = 1;
    mainCanvasCtx.strokeStyle = '#000fff';
    mainCanvasCtx.stroke();

    // 비주얼라이저 파형을 그리기
    loops.forEach(loop => {
        const analyser = loop.analyser;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        mainCanvasCtx.lineWidth = 1;
        mainCanvasCtx.strokeStyle = '#000fff';
        mainCanvasCtx.beginPath();

        let sliceWidth = mainCanvas.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            let v = dataArray[i] / 128.0;
            let y = (v * mainCanvas.height) / 2;

            if (i === 0) {
                mainCanvasCtx.moveTo(x, y);
            } else {
                mainCanvasCtx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        mainCanvasCtx.lineTo(mainCanvas.width, mainCanvas.height / 2);
        mainCanvasCtx.stroke();
    });
}
draw();

// 필터 버튼 클릭 이벤트 추가
document.getElementById('origin').addEventListener('click', () => {
    filterStates.origin = true;
    filterStates.grayscale = false;
    filterStates.negative = false;
});

document.getElementById('grayscale').addEventListener('click', () => {
    filterStates.origin = false;
    filterStates.grayscale = true;
    filterStates.negative = false;
});

// 네거티브 버튼 클릭 이벤트 추가
document.getElementById('negative').addEventListener('click', () => {
    filterStates.origin = false;
    filterStates.grayscale = false;
    filterStates.negative = true;
});

// 녹음 시작
document.getElementById('record').addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (!recorder || recorder.state === "inactive") {
        recorder = new MediaRecorder(mediaStream);

        recorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };

        recorder.onstop = () => {
            const audioBlob = new Blob(audioChunks);
            const audioURL = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioURL);
            audio.loop = true; 
            loops.push({ audio, analyser: audioContext.createAnalyser() });
            audioChunks = [];

            // 비주얼라이저 설정
            const source = audioContext.createMediaElementSource(audio);
            const analyser = loops[loops.length - 1].analyser;
            source.connect(analyser);
            analyser.connect(audioContext.destination);
        };

        recorder.start();
    }
});

// 녹음 중지
document.getElementById('stop').addEventListener('click', () => {
    if (recorder && recorder.state === "recording") {
        recorder.stop();
    }
});

// 루프 재생
document.getElementById('play').addEventListener('click', () => {
    loops.forEach(loop => {
        loop.audio.currentTime = 0;
        loop.audio.play();
    });
});

// 마지막 레이어 삭제
document.getElementById('deleteLast').addEventListener('click', () => {
    const lastLoop = loops.pop();
    if (lastLoop) {
        lastLoop.audio.pause();
        lastLoop.audio.currentTime = 0;
    }
});

// 모든 레이어 삭제
document.getElementById('deleteAll').addEventListener('click', () => {
    loops.forEach(loop => {
        loop.audio.pause();
        loop.audio.currentTime = 0;
    });
    loops = [];
});
