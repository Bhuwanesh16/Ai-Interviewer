import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WebcamRecorder = ({ isRecording, onReady, mediaStream, setMediaStream, onEmotionScore }) => {
  const videoRef = useRef(null)
  const [faceLandmarker, setFaceLandmarker] = useState(null)
  const [isLoadingModel, setIsLoadingModel] = useState(true)

  // Initialize MediaPipe FaceLandmarker
  useEffect(() => {
    const initLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
        )
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU" // Uses WebGL
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        })
        setFaceLandmarker(landmarker)
      } catch (err) {
        console.error('Failed to initialize FaceLandmarker', err)
      } finally {
        setIsLoadingModel(false)
      }
    }
    initLandmarker()
  }, [])

  // Process video frames for emotion detection
  useEffect(() => {
    let animationFrameId
    let lastVideoTime = -1

    const processVideo = () => {
      if (videoRef.current && faceLandmarker && isRecording) {
        const video = videoRef.current
        // Only process if the video frame has been updated
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime
          try {
            const results = faceLandmarker.detectForVideo(video, performance.now())
            if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
              const shapes = results.faceBlendshapes[0].categories

              const getScore = (name) => shapes.find(s => s.categoryName === name)?.score || 0

              const smile = Math.max(getScore('mouthSmileLeft'), getScore('mouthSmileRight'))
              const eyeOpen = 1 - Math.max(getScore('eyeBlinkLeft'), getScore('eyeBlinkRight'))
              const browDown = Math.max(getScore('browDownLeft'), getScore('browDownRight'))

              // Edge AI metric: basic heuristic for interview engagement
              // Positive signals: smiling, eyes open. Negative: intensely furrowed brows
              let emoScore = (smile * 0.4) + (eyeOpen * 0.5) + ((1 - browDown) * 0.1)
              // Normalize slightly to keep it in 0-1 range (smiling implies higher score)
              emoScore = Math.max(0, Math.min(1, emoScore * 1.5))

              const now = performance.now()
              if (onEmotionScore && (!videoRef.current._lastE || now - videoRef.current._lastE > 500)) {
                onEmotionScore(emoScore)
                videoRef.current._lastE = now
              }
            }
          } catch (err) {
            console.error('Error during media pipe inference', err)
          }
        }
      }
      animationFrameId = requestAnimationFrame(processVideo)
    }

    if (isRecording && faceLandmarker) {
      processVideo()
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
    }
  }, [faceLandmarker, isRecording, onEmotionScore])

  // Setup generic webcam stream
  useEffect(() => {
    const setup = async () => {
      if (!mediaStream) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          setMediaStream(stream)
          if (videoRef.current) videoRef.current.srcObject = stream
          if (onReady) onReady(stream)
        } catch (err) {
          console.error('Error accessing media devices', err)
        }
      } else if (videoRef.current && mediaStream) {
        videoRef.current.srcObject = mediaStream
      }
    }
    setup()
  }, [mediaStream, onReady, setMediaStream])

  return (
    <div style={{
      borderRadius: '1.25rem',
      border: `1px solid ${isRecording ? 'rgba(225,29,72,0.25)' : 'rgba(148,163,184,0.25)'}`,
      background: 'rgba(255,255,255,0.95)',
      overflow: 'hidden',
      transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
      boxShadow: isRecording
        ? '0 0 0 1px rgba(225,29,72,0.1), 0 4px 24px rgba(0,0,0,0.08)'
        : '0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)',
      position: 'relative',
    }}>
      {/* Aspect ratio wrapper */}
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {/* Scanline when recording */}
        {isRecording && (
          <div style={{
            position: 'absolute',
            left: 0, right: 0,
            height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(251,113,133,0.4), transparent)',
            animation: 'scanline 3s linear infinite',
            pointerEvents: 'none',
            zIndex: 2,
          }} />
        )}

        {/* Corner brackets */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => {
          const [v, h] = pos.split('-')
          return (
            <div key={pos} style={{
              position: 'absolute',
              [v]: 12, [h]: 12,
              width: 16, height: 16,
              borderTop: v === 'top' ? `1.5px solid ${isRecording ? 'rgba(251,113,133,0.5)' : 'rgba(56,189,248,0.4)'}` : 'none',
              borderBottom: v === 'bottom' ? `1.5px solid ${isRecording ? 'rgba(251,113,133,0.5)' : 'rgba(56,189,248,0.4)'}` : 'none',
              borderLeft: h === 'left' ? `1.5px solid ${isRecording ? 'rgba(251,113,133,0.5)' : 'rgba(56,189,248,0.4)'}` : 'none',
              borderRight: h === 'right' ? `1.5px solid ${isRecording ? 'rgba(251,113,133,0.5)' : 'rgba(56,189,248,0.4)'}` : 'none',
              transition: 'border-color 0.4s ease',
              zIndex: 3,
            }} />
          )
        })}

        {/* Status badge */}
        <div style={{
          position: 'absolute',
          top: 12, left: 12,
          display: 'flex', alignItems: 'center', gap: '0.45rem',
          padding: '0.3rem 0.7rem',
          borderRadius: '99px',
          background: 'rgba(2,6,15,0.75)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${isRecording ? 'rgba(251,113,133,0.2)' : 'rgba(148,163,184,0.1)'}`,
          zIndex: 4,
          transition: 'border-color 0.3s ease',
        }}>
          <div style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: isRecording ? '#fb7185' : '#334155',
            boxShadow: isRecording ? '0 0 8px rgba(251,113,133,0.9)' : 'none',
            animation: isRecording ? 'recordPulse 1s ease-in-out infinite' : 'none',
            transition: 'background 0.3s ease',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            color: isRecording ? '#fda4af' : '#334155',
            transition: 'color 0.3s ease',
          }}>
            {isRecording ? 'REC' : 'PREVIEW'}
          </span>
        </div>

        {/* Bottom info bar */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          padding: '1.5rem 0.875rem 0.625rem',
          background: 'linear-gradient(to top, rgba(2,6,15,0.7) 0%, transparent 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          zIndex: 4,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.55rem',
            letterSpacing: '0.1em',
            color: 'rgba(56,189,248,0.4)',
          }}>720p · local</span>
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
            {/* mini VU bar */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: 2,
                height: 4 + i * 2,
                borderRadius: 99,
                background: isRecording ? `rgba(251,113,133,${0.2 + i * 0.15})` : 'rgba(56,189,248,0.1)',
                transition: 'background 0.3s ease',
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default WebcamRecorder