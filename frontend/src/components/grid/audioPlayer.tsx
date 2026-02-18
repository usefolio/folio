import { useEffect, useRef, useState, forwardRef } from "react";
import { formatTime } from "../../utils/general";
import { Button } from "../ui/button";
import { Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";

const AudioPlayer = forwardRef<HTMLAudioElement, { src: string }>(
  ({ src }, ref) => {
    // Create a local ref if no ref is provided, control playback with the ref
    const internalRef = useRef<HTMLAudioElement | null>(null);
    const audioRef =
      (ref as React.MutableRefObject<HTMLAudioElement>) || internalRef;
    const previousVolumeRef = useRef(1); // Stores the last non-zero volume
    const progressRef = useRef<HTMLInputElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isAudioReady, setIsAudioReady] = useState(false);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      // Update progress bar as the audio plays
      const updateProgress = () => {
        setCurrentTime(audio.currentTime);
      };

      // Get the total duration of the audio once metadata is loaded
      const setAudioDuration = () => {
        setDuration(audio.duration);
      };

      // Reset playback when audio reaches the end
      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      const handleCanPlay = () => {
        setIsAudioReady(true);
      };
      // Attach event listeners to the audio element
      audio.addEventListener("timeupdate", updateProgress);
      audio.addEventListener("loadedmetadata", setAudioDuration);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("canplay", handleCanPlay);

      return () => {
        // Remove event listeners on component unmount
        audio.removeEventListener("timeupdate", updateProgress);
        audio.removeEventListener("loadedmetadata", setAudioDuration);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("canplay", handleCanPlay);
        setIsAudioReady(false);
      };
    }, [src]);
    // Play or pause audio when user clicks the icon
    const togglePlay = () => {
      const audio = audioRef.current;
      if (!audioRef.current || !isAudioReady) return;

      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;

      const newTime = parseFloat(e.target.value);
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    };
    // Update volume level when user changes it
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);
      if (audioRef.current) {
        audioRef.current.volume = newVolume;
        setIsMuted(newVolume === 0);
      }
    };
    // Mute/unmute logic. If volume is 0, set it to a default value when unmuting
    const toggleMute = () => {
      if (!audioRef.current) return;

      setIsMuted((prevMuted) => {
        let newVolume;

        if (prevMuted) {
          // Restore the previous volume from ref unless it was 0, then set it to 1
          newVolume =
            previousVolumeRef.current === 0 ? 1 : previousVolumeRef.current;
        } else {
          // Store current volume in ref before muting
          previousVolumeRef.current = volume;
          newVolume = 0;
        }
        const progress = newVolume * 100;
        const volumeSlider = document.getElementById(
          "audio-player-volume-slider",
        ) as HTMLInputElement;
        if (volumeSlider) {
          volumeSlider.style.background = `linear-gradient(to right, #60a5fa ${progress}%, #e5e7eb ${progress}%)`;
        }
        setVolume(newVolume);
        audioRef.current.volume = newVolume;

        return !prevMuted;
      });
    };

    return (
      <>
        <div
          id="audio-player"
          className="flex items-center gap-3 p-3 bg-gray-50 rounded-md w-full"
        >
          <audio ref={audioRef} src={src}></audio>

          {/* Play/Pause Button */}
          {!isAudioReady ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : isPlaying ? (
            <Button
              size="icon"
              onClick={togglePlay}
              disabled={!isAudioReady}
              variant="outline"
              className="rounded-md h-7 w-7"
            >
              <Pause className="text-primary text-xl cursor-pointer hover:text-primary/60 transition" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={togglePlay}
              disabled={!isAudioReady}
              variant="outline"
              className="rounded-md h-7 w-7"
            >
              <Play className="text-primary text-xl cursor-pointer hover:text-primary/60 transition" />
            </Button>
          )}
          {/* Progress Bar */}
          <div className="flex-1 flex items-center">
            <span className="text-xs">{formatTime(currentTime)}</span>
            <input
              id="audio-player-seeker-slider"
              ref={progressRef}
              disabled={!isAudioReady}
              type="range"
              min="0"
              max={duration || 1}
              value={currentTime}
              step="0.1"
              onChange={handleSeek}
              className="w-full h-2 mx-2 cursor-pointer appearance-none rounded-md p-0"
              // Dynamically update the color of the seeker depending on current time
              style={{
                background: `linear-gradient(to right, #FF6B00 ${(currentTime / (duration || 1)) * 100}%, #f1f1f1 ${(currentTime / (duration || 1)) * 100}%)`,
              }}
            />
            <span className="text-xs">{formatTime(duration)}</span>
          </div>

          {/* Volume Control */}
          {isMuted ? (
            <Button
              size="icon"
              variant="outline"
              onClick={toggleMute}
              disabled={!isAudioReady}
              className="rounded-md h-7 w-7"
            >
              <VolumeX className="text-primary text-lg cursor-pointer hover:text-primary/60 transition" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="outline"
              onClick={toggleMute}
              disabled={!isAudioReady}
              className="rounded-md h-7 w-7"
            >
              <Volume2 className="text-primary text-lg cursor-pointer hover:text-primary/60 transition" />
            </Button>
          )}
          <input
            id="audio-player-volume-slider"
            type="range"
            min="0"
            max="1"
            disabled={!isAudioReady}
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-2 cursor-pointer appearance-none accent-accent p-0 rounded-md"
            // Dynamically update the color of the volume slider depending on current volume
            style={{
              background: `linear-gradient(to right, #FF6B00 ${volume * 100}%, #f1f1f1 ${volume * 100}%)`,
            }}
          />
        </div>
      </>
    );
  },
);

export default AudioPlayer;
