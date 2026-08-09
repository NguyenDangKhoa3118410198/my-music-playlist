import { type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  FastForward,
  Maximize2,
  Music2,
  Pause,
  Play,
  Rewind,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import type { Song } from '../types';
import {
  getYoutubeEmbedUrl,
  getYoutubeThumbnailUrl,
  getYoutubeVideoId,
} from '../lib/youtube';

type YoutubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YoutubePlayerEvent = {
  data: number;
  target: YoutubePlayer;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars: Record<string, string | number>;
          events: {
            onReady: (event: YoutubePlayerEvent) => void;
            onStateChange: (event: YoutubePlayerEvent) => void;
          };
        },
      ) => YoutubePlayer;
      PlayerState: {
        ENDED: number;
        PAUSED: number;
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYoutubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve();

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previousCallback = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        resolve();
      };

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.append(script);
      }
    });
  }

  return youtubeApiPromise;
}

type Props = {
  song: Song | null;
  playRequestId: number;
  canSkip: boolean;
  onPrevious: () => void;
  onNext: (shuffle?: boolean) => void;
  onClose: () => void;
};

export function PlayerBar({
  song,
  playRequestId,
  canSkip,
  onPrevious,
  onNext,
  onClose,
}: Props) {
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YoutubePlayer | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const canSkipRef = useRef(canSkip);
  const isShuffleRef = useRef(false);
  const onNextRef = useRef(onNext);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const embedUrl = getYoutubeEmbedUrl(song?.youtube_url);
  const videoId = getYoutubeVideoId(song?.youtube_url);
  const thumbnailUrl = getYoutubeThumbnailUrl(song?.youtube_url);
  const canPlay = Boolean(song && videoId);
  const hasAudioSession = Boolean(videoId && (isListening || isPaused));
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;

  useEffect(() => {
    canSkipRef.current = canSkip;
  }, [canSkip]);

  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);

  useEffect(() => {
    if (!song) {
      setIsVideoOpen(false);
      setIsListening(false);
      setIsPaused(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (canPlay && playRequestId > 0) {
      setIsVideoOpen(false);
      setIsListening(true);
      setIsPaused(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [canPlay, playRequestId, song]);

  useEffect(() => {
    if (!hasAudioSession || !videoId || !audioHostRef.current) {
      playerRef.current?.destroy();
      playerRef.current = null;
      return;
    }

    let cancelled = false;

    void loadYoutubeIframeApi().then(() => {
      if (cancelled || !audioHostRef.current || !window.YT?.Player) return;

      const mount = document.createElement('div');
      audioHostRef.current.replaceChildren(mount);

      playerRef.current?.destroy();
      playerRef.current = new window.YT.Player(mount, {
        videoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            event.target.playVideo();

            const nextDuration = event.target.getDuration();
            if (Number.isFinite(nextDuration) && nextDuration > 0) {
              setDuration(nextDuration);
            }

            if (pendingSeekRef.current !== null) {
              event.target.seekTo(pendingSeekRef.current, true);
              pendingSeekRef.current = null;
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT?.PlayerState.PLAYING) {
              setIsListening(true);
              setIsPaused(false);
            } else if (event.data === window.YT?.PlayerState.PAUSED) {
              setIsListening(false);
              setIsPaused(true);
            } else if (event.data === window.YT?.PlayerState.ENDED) {
              setIsListening(false);
              setIsPaused(false);
              setCurrentTime(0);

              if (canSkipRef.current) {
                onNextRef.current(isShuffleRef.current);
              }
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      audioHostRef.current?.replaceChildren();
    };
  }, [hasAudioSession, videoId]);

  useEffect(() => {
    if (!hasAudioSession) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const nextTime = player.getCurrentTime();
      const nextDuration = player.getDuration();

      if (Number.isFinite(nextTime)) {
        setCurrentTime(nextDuration ? Math.min(nextTime, nextDuration) : nextTime);
      }

      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setDuration(nextDuration);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [hasAudioSession]);

  function handleOpenVideo() {
    setIsListening(false);
    setIsPaused(false);
    setIsVideoOpen(true);
    playerRef.current?.destroy();
    playerRef.current = null;
  }

  function handleClosePlayer() {
    setIsListening(false);
    setIsPaused(false);
    setIsVideoOpen(false);
    playerRef.current?.destroy();
    playerRef.current = null;
    onClose();
  }

  function handleTogglePlay() {
    if (!canPlay) return;

    if (!hasAudioSession) {
      setIsListening(true);
      setIsPaused(false);
      return;
    }

    if (isListening) {
      playerRef.current?.pauseVideo();
      setIsListening(false);
      setIsPaused(true);
    } else {
      playerRef.current?.playVideo();
      setIsListening(true);
      setIsPaused(false);
    }
  }

  function handleSeek(nextTime: number) {
    if (!canPlay) return;

    const boundedTime = Math.max(
      0,
      duration ? Math.min(nextTime, duration) : nextTime,
    );
    setCurrentTime(boundedTime);

    if (!hasAudioSession) {
      pendingSeekRef.current = boundedTime;
      setIsListening(true);
      setIsPaused(false);
      return;
    }

    playerRef.current?.seekTo(boundedTime, true);
  }

  return (
    <>
      <footer className='player-bar'>
        {hasAudioSession && videoId && (
          <div ref={audioHostRef} className='audio-embed' aria-hidden='true' />
        )}
        <div className='player-track'>
          <div className='player-art'>
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt='' />
            ) : (
              <Music2 size={20} />
            )}
          </div>
          <div>
            <p>{song?.title || 'Chọn một bài để phát'}</p>
            <span>{song?.artist || 'Karaoke Playlist'}</span>
          </div>
        </div>

        <div className='player-center'>
          <div className='player-controls'>
            <button
              className={
                isShuffle ? 'icon-button dark active' : 'icon-button dark'
              }
              type='button'
              disabled={!canPlay || !canSkip}
              onClick={() => setIsShuffle((current) => !current)}
              title={isShuffle ? 'Tắt phát ngẫu nhiên' : 'Phát ngẫu nhiên'}
              aria-pressed={isShuffle}
            >
              <Shuffle size={18} />
            </button>
            <button
              className='icon-button dark'
              type='button'
              disabled={!canPlay || !canSkip}
              onClick={onPrevious}
              title='Bài trước'
            >
              <SkipBack size={18} fill='currentColor' />
            </button>
            <button
              className='icon-button dark'
              type='button'
              disabled={!canPlay}
              onClick={() => handleSeek(currentTime - 10)}
              title='Lùi 10 giây'
            >
              <Rewind size={18} />
            </button>
            <button
              className='player-primary'
              type='button'
              disabled={!canPlay}
              onClick={handleTogglePlay}
              title={canPlay ? 'Nghe nhạc' : 'Chưa có link YouTube'}
              aria-label={isListening ? 'Tạm ngừng' : isPaused ? 'Phát tiếp' : 'Nghe'}
            >
              {isListening ? (
                <Pause size={20} fill='currentColor' />
              ) : (
                <Play size={20} fill='currentColor' />
              )}
            </button>
            <button
              className='icon-button dark'
              type='button'
              disabled={!canPlay}
              onClick={() => handleSeek(currentTime + 10)}
              title='Tới 10 giây'
            >
              <FastForward size={18} />
            </button>
            <button
              className='icon-button dark'
              type='button'
              disabled={!canPlay || !canSkip}
              onClick={() => onNext(isShuffle)}
              title={isShuffle ? 'Bài ngẫu nhiên tiếp theo' : 'Bài tiếp theo'}
            >
              <SkipForward size={18} fill='currentColor' />
            </button>
          </div>
          <div className='player-progress-row'>
            <span>{formatTime(currentTime)}</span>
            <input
              aria-label='Tua bài hát'
              type='range'
              min='0'
              max={duration || 0}
              step='1'
              value={duration ? Math.min(currentTime, duration) : 0}
              disabled={!canPlay || !duration}
              style={{ '--progress': `${progressPercent}%` } as CSSProperties}
              onChange={(event) => handleSeek(Number(event.target.value))}
            />
            <span>{duration ? formatTime(duration) : '--:--'}</span>
          </div>
        </div>

        <div className='player-actions'>
          {song?.youtube_url && (
            <>
              <button
                className='icon-button dark'
                type='button'
                onClick={handleOpenVideo}
                title='Xem MV'
              >
                <Maximize2 size={18} />
              </button>
              <a
                className='icon-button dark'
                href={song.youtube_url}
                target='_blank'
                rel='noreferrer'
                title='Mở YouTube'
              >
                <ExternalLink size={18} />
              </a>
            </>
          )}
          {song && (
            <button
              className='icon-button dark'
              type='button'
              onClick={handleClosePlayer}
              title='Đóng player'
            >
              <X size={18} />
            </button>
          )}
        </div>
      </footer>

      {isVideoOpen && song && embedUrl && (
        <div className='video-backdrop'>
          <section className='video-dialog'>
            <div className='video-header'>
              <div>
                <h2>{song.title}</h2>
                <p>{song.artist || 'Karaoke Playlist'}</p>
              </div>
              <div className='video-actions'>
                <a
                  className='icon-button dark'
                  href={song.youtube_url || '#'}
                  target='_blank'
                  rel='noreferrer'
                  title='Mở YouTube'
                >
                  <ExternalLink size={18} />
                </a>
                <button
                  className='icon-button dark'
                  type='button'
                  onClick={() => setIsVideoOpen(false)}
                  title='Đóng video'
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe
              title={`Phát ${song.title}`}
              src={embedUrl}
              allow='autoplay; encrypted-media; picture-in-picture'
              allowFullScreen
            />
          </section>
        </div>
      )}
    </>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
