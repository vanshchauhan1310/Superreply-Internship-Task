import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

export default function VoiceSynthesizer() {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioError, setAudioError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  
  const fileInputRef = useRef(null);
  const audioRef = useRef(new Audio());

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  const validateFile = (file) => {
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4'];
    if (!validTypes.includes(file.type)) {
      throw new Error('Invalid file type. Please upload an audio file (WAV, MP3, or MP4).');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File size too large. Maximum size is 5MB.');
    }
  };

  const handleFileChange = (event) => {
    try {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        validateFile(selectedFile);
        setFile(selectedFile);
        setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const checkFileStatus = async (fileName) => {
    try {
      const response = await axios.get(`http://localhost:3001/api/check-file/${fileName}`);
      
      if (response.data.exists && response.data.url) {
        setAudioUrl(response.data.url);
        setLoading(false);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error checking file status:', err);
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text || !file) {
      setError('Both text and voice file are required.');
      return;
    }
  
    setLoading(true);
    setError('');
    setAudioUrl('');
    setUploadProgress(0);
    setAudioError('');
  
    const formData = new FormData();
    formData.append('voiceFile', file);
    formData.append('text', text);
  
    try {
      const response = await axios.post('http://localhost:3001/api/synthesize', formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        },
      });
  
      console.log('Data received from API:', response.data);
  
      if (response.data.url) {
        setAudioUrl(response.data.url);
        setLoading(false);
      } else if (response.data.fileName) {
        let retries = 0;
        const maxRetries = 10;
        const fileName = response.data.fileName.split('/').pop();
  
        const checkFile = async () => {
          if (retries >= maxRetries) {
            throw new Error('Failed to generate audio file after multiple attempts');
          }
  
          const statusResponse = await axios.get(`http://localhost:3001/api/check-file/${fileName}`);
          
          if (statusResponse.data.exists && statusResponse.data.url) {
            setAudioUrl(statusResponse.data.url);
            setLoading(false);
            return true;
          }
          
          retries++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          return checkFile();
        };
  
        await checkFile();
      }
  
    } catch (err) {
      console.error('Error during synthesis:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };
  
  const handleRetry = () => {
    setError('');
    setAudioUrl('');
    setFile(null);
    setText('');
    setUploadProgress(0);
    setAudioError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const playPause = () => {
    const audio = audioRef.current;
    
    if (audioUrl) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        setAudioError('');
        
        if (audio.src !== audioUrl) {
          audio.src = audioUrl;
          
          audio.onerror = () => {
            setAudioError('Failed to play audio. Please try again.');
            setIsPlaying(false);
          };
          
          audio.onended = () => {
            setIsPlaying(false);
          };
        }
        
        audio.play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch(error => {
            console.error('Error playing audio:', error);
            setAudioError('Failed to play audio. Please try again.');
            setIsPlaying(false);
          });
      }
    }
  };

  const handleDownload = () => {
    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = 'synthesized_audio.mp3';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <div className="card-header">
          <h2>Voice Synthesizer</h2>
        </div>
        <div className="card-content">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="voiceFile">
                Upload Voice File (WAV, MP3, or MP4, max 5MB)
              </label>
              <input
                id="voiceFile"
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.mp4"
                onChange={handleFileChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="textToSynthesize">
                Text to Synthesize
              </label>
              <textarea
                id="textToSynthesize"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter the text you want to synthesize..."
              />
            </div>

            {error && (
              <div className="alert error">
                <span className="alert-icon">⚠</span>
                <div className="alert-content">
                  <h3>Error</h3>
                  <p>{error}</p>
                </div>
              </div>
            )}

            <div className="button-container">
              <button
                type="submit"
                disabled={loading || !file || !text}
                className="submit-button"
              >
                {loading ? (
                  <span className="loading-text">
                    <span className="loader"></span>
                    Processing...
                  </span>
                ) : (
                  <span>Synthesize Audio</span>
                )}
              </button>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}

              {audioUrl && (
                <div className="audio-section">
                  <div className="audio-header">
                    <span className="audio-icon">🔊</span>
                    <span>Generated Audio</span>
                  </div>
                  <div className="audio-controls">
                    <button 
                      onClick={playPause}
                      className={`play-button ${isPlaying ? 'playing' : ''}`}
                    >
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="download-button"
                    >
                      Download
                    </button>
                  </div>
                  {audioError && (
                    <div className="audio-error">
                      {audioError}
                    </div>
                  )}
                </div>
              )}

              {(error || audioUrl) && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="retry-button"
                >
                  Start Over
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}