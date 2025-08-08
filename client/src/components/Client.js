import React from 'react'
import Avatar from 'react-avatar'
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";

const Client = ({ username, isMuted }) => {
  return (
    <div className='d-flex flex-column align-items-center mb-2'>
      <Avatar name={username} size='50' round='14px' className="mb-1" />
      <span className='fw-bold text-light' style={{ fontSize: '0.8rem' }}>
        {username}
      </span>
      {isMuted ? <FaMicrophoneSlash className="text-danger ms-1" /> : <FaMicrophone className="text-success ms-1" />}
    </div>
  )
}

export default Client;