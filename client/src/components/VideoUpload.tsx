import { useState, useRef } from 'react'
import { Upload, X, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { VideoUpload, VideoStatus } from '../types'
import { apiService } from '@/service/api'
import { formatFileSize } from '@/lib/utils'

interface VideoUploadProps {
  onUploadComplete: (videoId: string) => void
}

export function VideoUploadComponent({ onUploadComplete }: VideoUploadProps) {
  const [uploads, setUploads] = useState<VideoUpload[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList) => {
    const videoFiles = Array.from(files).filter(file => 
      file.type.startsWith('video/')
    )
    
    if (videoFiles.length === 0) {
      alert('Please select valid video files')
      return
    }

    const newUploads: VideoUpload[] = videoFiles.map(file => ({
      file,
      progress: 0,
      status: VideoStatus.UPLOADING
    }))

    setUploads(prev => [...prev, ...newUploads])
    
    // Start uploads
    newUploads.forEach((upload, index) => {
      startUpload(upload, uploads.length + index)
    })
  }

  const startUpload = async (upload: VideoUpload, index: number) => {
    try {
      // Generate presigned URL
      const { presignedUrl, videoId } = await apiService.generatePresignedUrl(
        upload.file.name,
        upload.file.type
      )

      // Update with videoId
      setUploads(prev => prev.map((u, i) => 
        i === index ? { ...u, videoId } : u
      ))

      // Upload to S3
      await apiService.uploadToS3(presignedUrl, upload.file, (progress) => {
        setUploads(prev => prev.map((u, i) => 
          i === index ? { ...u, progress } : u
        ))
      })

      // Mark as uploaded
      setUploads(prev => prev.map((u, i) => 
        i === index ? { ...u, status: VideoStatus.UPLOADED, progress: 100 } : u
      ))

      onUploadComplete(videoId)
      
    } catch (error) {
      console.error('Upload failed:', error)
      setUploads(prev => prev.map((u, i) => 
        i === index ? { ...u, status: VideoStatus.ERROR } : u
      ))
    }
  }

  const removeUpload = (index: number) => {
    setUploads(prev => prev.filter((_, i) => i !== index))
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const getStatusColor = (status: VideoStatus) => {
    switch (status) {
      case VideoStatus.UPLOADING: return 'bg-blue-500'
      case VideoStatus.UPLOADED: return 'bg-green-500'
      case VideoStatus.PROCESSING: return 'bg-yellow-500'
      case VideoStatus.READY: return 'bg-emerald-500'
      case VideoStatus.ERROR: return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: VideoStatus) => {
    switch (status) {
      case VideoStatus.UPLOADED:
      case VideoStatus.READY:
        return <Check className="h-4 w-4" />
      case VideoStatus.ERROR:
        return <AlertCircle className="h-4 w-4" />
      default:
        return null
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Videos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <div className="space-y-2">
            <p className="text-lg font-medium">Drop video files here</p>
            <p className="text-sm text-muted-foreground">
              or click to browse (MP4, MOV, AVI supported)
            </p>
          </div>
          <Button 
            className="mt-4"
            onClick={() => fileInputRef.current?.click()}
          >
            Select Files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="video/*"
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        {/* Upload List */}
        {uploads.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium">Uploads</h3>
            {uploads.map((upload, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{upload.file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(upload.file.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="secondary"
                      className={`${getStatusColor(upload.status)} text-white`}
                    >
                      <div className="flex items-center gap-1">
                        {getStatusIcon(upload.status)}
                        {upload.status}
                      </div>
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeUpload(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {upload.status === VideoStatus.UPLOADING && (
                  <div className="space-y-2">
                    <Progress value={upload.progress} />
                    <p className="text-sm text-muted-foreground">
                      {Math.round(upload.progress)}% uploaded
                    </p>
                  </div>
                )}

                {upload.status === VideoStatus.ERROR && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Upload failed. Please try again.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}