import type { ReactNode } from "react";
import {
  FiActivity, FiAirplay, FiAlertCircle, FiAlertTriangle, FiArchive, FiArrowDown, FiArrowLeft, FiArrowRight, FiArrowUp,
  FiAward, FiBarChart2, FiBarChart, FiBell, FiBook, FiBookOpen, FiBox, FiBriefcase, FiCalendar, FiCamera, FiCast,
  FiCheckCircle, FiChevronDown, FiChevronUp, FiClipboard, FiClock, FiCloud, FiCode, FiCoffee, FiCommand, FiCompass,
  FiCpu, FiCreditCard, FiCrosshair, FiDatabase, FiDisc, FiDollarSign, FiDownload, FiEdit, FiEye, FiFeather,
  FiFile, FiFileText, FiFilter, FiFlag, FiFolder, FiFrown, FiGift, FiGitBranch, FiGitCommit, FiGlobe, FiGrid,
  FiHash, FiHeadphones, FiHeart, FiHelpCircle, FiHome, FiImage, FiInbox, FiInfo, FiKey, FiLayers, FiLayout,
  FiLifeBuoy, FiLink, FiList, FiLoader, FiLock, FiLogIn, FiLogOut, FiMail, FiMap, FiMapPin, FiMaximize,
  FiMeh, FiMenu, FiMessageCircle, FiMessageSquare, FiMic, FiMinimize, FiMinus, FiMonitor, FiMoon, FiMoreHorizontal,
  FiMove, FiMusic, FiNavigation, FiPaperclip, FiPause, FiPercent, FiPhone, FiPieChart, FiPlay, FiPlus, FiPlusCircle,
  FiPower, FiPrinter, FiRadio, FiRefreshCw, FiRepeat, FiRotateCw, FiSave, FiScissors, FiSearch, FiSend, FiServer,
  FiSettings, FiShare, FiShield, FiShoppingBag, FiShuffle, FiSidebar, FiSkipBack, FiSkipForward, FiSlash, FiSliders,
  FiSmartphone, FiSmile, FiSpeaker, FiSquare, FiStar, FiStopCircle, FiSun, FiTablet, FiTag, FiTarget, FiTerminal,
  FiThumbsDown, FiThumbsUp, FiToggleLeft, FiTool, FiTrash2, FiTrendingUp, FiTv, FiType, FiUmbrella, FiUnlock,
  FiUpload, FiUser, FiUserCheck, FiUserMinus, FiUserPlus, FiUserX, FiUsers, FiVideo, FiVolume2, FiWatch, FiWifi,
  FiWind, FiX, FiXCircle, FiZap, FiZoomIn, FiZoomOut
} from "react-icons/fi";
import {
  FaRobot, FaGamepad, FaTicketAlt, FaShieldAlt, FaMusic, FaDiscord,
  FaStar, FaStarHalfAlt, FaRegStar, FaRegSmile, FaRegLaugh, FaRegGrin, FaRegFrown, FaRegMeh,
  FaCrown, FaHammer, FaGavel, FaBalanceScale, FaClipboardList, FaRegClipboard,
  FaRegCalendarAlt, FaStopwatch, FaBell, FaRegBell, FaEnvelope, FaRegEnvelope,
  FaPaperPlane, FaCheckDouble, FaInfinity, FaDice, FaDiceD6, FaMagic
} from "react-icons/fa";

const IconMap: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  FiActivity, FiAirplay, FiAlertCircle, FiAlertTriangle, FiArchive, FiArrowDown, FiArrowLeft, FiArrowRight, FiArrowUp,
  FiAward, FiBarChart2, FiBarChart, FiBell, FiBook, FiBookOpen, FiBox, FiBriefcase, FiCalendar, FiCamera, FiCast,
  FiCheckCircle, FiChevronDown, FiChevronUp, FiClipboard, FiClock, FiCloud, FiCode, FiCoffee, FiCommand, FiCompass,
  FiCpu, FiCreditCard, FiCrosshair, FiDatabase, FiDisc, FiDollarSign, FiDownload, FiEdit, FiEye, FiFeather,
  FiFile, FiFileText, FiFilter, FiFlag, FiFolder, FiFrown, FiGift, FiGitBranch, FiGitCommit, FiGlobe, FiGrid,
  FiHash, FiHeadphones, FiHeart, FiHelpCircle, FiHome, FiImage, FiInbox, FiInfo, FiKey, FiLayers, FiLayout,
  FiLifeBuoy, FiLink, FiList, FiLoader, FiLock, FiLogIn, FiLogOut, FiMail, FiMap, FiMapPin, FiMaximize,
  FiMeh, FiMenu, FiMessageCircle, FiMessageSquare, FiMic, FiMinimize, FiMinus, FiMonitor, FiMoon, FiMoreHorizontal,
  FiMove, FiMusic, FiNavigation, FiPaperclip, FiPause, FiPercent, FiPhone, FiPieChart, FiPlay, FiPlus, FiPlusCircle,
  FiPower, FiPrinter, FiRadio, FiRefreshCw, FiRepeat, FiRotateCw, FiSave, FiScissors, FiSearch, FiSend, FiServer,
  FiSettings, FiShare, FiShield, FiShoppingBag, FiShuffle, FiSidebar, FiSkipBack, FiSkipForward, FiSlash, FiSliders,
  FiSmartphone, FiSmile, FiSpeaker, FiSquare, FiStar, FiStopCircle, FiSun, FiTablet, FiTag, FiTarget, FiTerminal,
  FiThumbsDown, FiThumbsUp, FiToggleLeft, FiTool, FiTrash2, FiTrendingUp, FiTv, FiType, FiUmbrella, FiUnlock,
  FiUpload, FiUser, FiUserCheck, FiUserMinus, FiUserPlus, FiUserX, FiUsers, FiVideo, FiVolume2, FiWatch, FiWifi,
  FiWind, FiX, FiXCircle, FiZap, FiZoomIn, FiZoomOut,
  FaRobot, FaGamepad, FaTicketAlt, FaShieldAlt, FaMusic, FaDiscord, FaStar, FaStarHalfAlt, FaRegStar,
  FaRegSmile, FaRegLaugh, FaRegGrin, FaRegFrown, FaRegMeh, FaCrown, FaHammer, FaGavel, FaBalanceScale,
  FaClipboardList, FaRegClipboard, FaRegCalendarAlt, FaStopwatch, FaBell, FaRegBell, FaEnvelope, FaRegEnvelope,
  FaPaperPlane, FaCheckDouble, FaInfinity, FaDice, FaDiceD6, FaMagic
};

function IsReactIconName(Name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]+$/.test(Name) && Name in IconMap;
}

function IsFileIcon(Name: string): boolean {
  return /\.(svg|png|jpg|jpeg|gif|webp)$/iu.test(Name);
}

function IsUrl(Name: string): boolean {
  return /^https?:\/\//iu.test(Name);
}

export function PluginIcon({ Icon, PluginId, ClassName, Size }: { Icon: string; PluginId?: string; ClassName?: string; Size?: number }): ReactNode {
  const IconSize = Size ?? 20;

  if (IsUrl(Icon)) {
    return <img alt="" className={ClassName ?? "h-8 w-8 rounded-xl object-cover"} src={Icon} />;
  }

  if (IsFileIcon(Icon) && PluginId) {
    return <img alt="" className={ClassName ?? "h-8 w-8 rounded-xl object-cover"} src={`/api/admin/custom-plugins/${PluginId}/icon`} />;
  }

  if (IsReactIconName(Icon)) {
    const Component = IconMap[Icon];
    return <Component className={ClassName ?? "h-8 w-8 rounded-xl object-cover"} size={IconSize} />;
  }

  return <span className={`flex items-center justify-center ${ClassName ?? "h-8 w-8 rounded-xl bg-white/10 text-sm font-black"}`}>{Icon.slice(0, 2).toUpperCase()}</span>;
}
